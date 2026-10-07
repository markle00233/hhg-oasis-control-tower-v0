import "dart:convert";
import "dart:io";
import "dart:typed_data";

import "package:file_picker/file_picker.dart";
import "package:flutter/material.dart";
import "package:image_picker/image_picker.dart";
import "package:path_provider/path_provider.dart";
import "package:provider/provider.dart";
import "package:share_plus/share_plus.dart";
import "package:url_launcher/url_launcher.dart";

import "../app_state.dart";
import "../config.dart";
import "../models.dart";
import "../theme.dart";

/// File / camera attach + download cho Task lớn hoặc 1 hạng mục nhỏ.
class TaskAttachmentsPanel extends StatefulWidget {
  const TaskAttachmentsPanel({
    super.key,
    required this.projectId,
    this.stepIndex,
    this.stepLabel,
    this.compact = false,
    this.onChanged,
  });

  final String projectId;
  final int? stepIndex;
  final String? stepLabel;
  final bool compact;
  final VoidCallback? onChanged;

  @override
  State<TaskAttachmentsPanel> createState() => _TaskAttachmentsPanelState();
}

class _TaskAttachmentsPanelState extends State<TaskAttachmentsPanel> {
  final _picker = ImagePicker();
  List<Map<String, dynamic>> _docs = [];
  List<Map<String, dynamic>> _proofs = [];
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void didUpdateWidget(covariant TaskAttachmentsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId ||
        oldWidget.stepIndex != widget.stepIndex) {
      _reload();
    }
  }

  Future<void> _reload() async {
    setState(() => _loading = true);
    try {
      final state = context.read<AppState>();
      final docs = await state.fetchProjectDocs(widget.projectId);
      OasisProject? project;
      final cached = state.projects.where((p) => p.id == widget.projectId);
      if (cached.isNotEmpty) {
        project = cached.first;
      }
      try {
        project = await state.fetchProject(widget.projectId);
      } catch (_) {
        // keep cached
      }
      final step = widget.stepIndex;
      final filteredDocs = docs.where((d) {
        final note = d["note"]?.toString() ?? "";
        final m = RegExp(r"step:(\d+)").firstMatch(note);
        if (step == null) return true;
        return m != null && int.tryParse(m.group(1)!) == step;
      }).toList();
      List<Map<String, dynamic>> proofs = const [];
      if (step != null && project != null && step < project.stepProofs.length) {
        proofs = List<Map<String, dynamic>>.from(project.stepProofs[step]);
      } else if (step == null && project != null) {
        // Task-level: flatten all step proofs with label.
        final labels = project.stepLabels;
        final flat = <Map<String, dynamic>>[];
        for (var i = 0; i < project.stepProofs.length; i++) {
          for (final p in project.stepProofs[i]) {
            flat.add({
              ...p,
              "_stepIndex": i,
              "_stepLabel": i < labels.length ? labels[i] : "Hạng mục ${i + 1}",
            });
          }
        }
        proofs = flat;
      }
      if (!mounted) return;
      setState(() {
        _docs = filteredDocs;
        _proofs = proofs;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }

  String _mimeFromName(String name) {
    final n = name.toLowerCase();
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".webp")) return "image/webp";
    if (n.endsWith(".gif")) return "image/gif";
    if (n.endsWith(".pdf")) return "application/pdf";
    return "image/jpeg";
  }

  Future<String?> _bytesToDataUrl(Uint8List bytes, String fileName) async {
    if (bytes.isEmpty) return null;
    // ~1MB API limit after base64 (~750KB raw).
    if (bytes.length > 750000) {
      if (!mounted) return null;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("File quá lớn (>750KB). Chọn ảnh/PDF nhỏ hơn.")),
      );
      return null;
    }
    final b64 = base64Encode(bytes);
    return "data:${_mimeFromName(fileName)};base64,$b64";
  }

  Future<void> _uploadCamera() async {
    if (_busy) return;
    final shot = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 72,
      maxWidth: 1600,
    );
    if (shot == null) return;
    await _uploadPickedImage(shot);
  }

  Future<void> _uploadGallery() async {
    if (_busy) return;
    final shot = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 72,
      maxWidth: 1600,
    );
    if (shot == null) return;
    await _uploadPickedImage(shot);
  }

  Future<void> _uploadPickedImage(XFile shot) async {
    setState(() => _busy = true);
    try {
      final bytes = await shot.readAsBytes();
      final name = shot.name.isNotEmpty
          ? shot.name
          : "photo_${DateTime.now().millisecondsSinceEpoch}.jpg";
      final dataUrl = await _bytesToDataUrl(bytes, name);
      if (dataUrl == null) return;
      await _persistUpload(fileName: name, dataUrl: dataUrl);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Đã tải ảnh lên")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _persistUpload({
    required String fileName,
    required String dataUrl,
  }) async {
    final state = context.read<AppState>();
    final step = widget.stepIndex;
    // Ảnh trên hạng mục → stepProofs (DB). PDF/file hoặc Task lớn → /api/documents.
    if (step != null && dataUrl.startsWith("data:image/")) {
      try {
        await state.addStepProof(
          projectId: widget.projectId,
          stepIndex: step,
          fileName: fileName,
          dataUrl: dataUrl,
        );
        await _reload();
        widget.onChanged?.call();
        return;
      } catch (_) {
        // Fallback Document nếu không có quyền stepProof.
      }
    }
    await state.uploadProjectDoc(
      projectId: widget.projectId,
      fileName: fileName,
      dataUrl: dataUrl,
      stepIndex: step,
    );
    await _reload();
    widget.onChanged?.call();
  }

  Future<void> _uploadFile() async {
    if (_busy) return;
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ["pdf", "png", "jpg", "jpeg", "webp", "gif"],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final f = result.files.first;
    final bytes = f.bytes ??
        (f.path != null ? await File(f.path!).readAsBytes() : null);
    if (bytes == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Không đọc được file")),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final name = f.name;
      final dataUrl = await _bytesToDataUrl(Uint8List.fromList(bytes), name);
      if (dataUrl == null) return;
      await _persistUpload(fileName: name, dataUrl: dataUrl);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Đã tải file lên")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _download({
    required String name,
    String? storageUrl,
    String? dataUrl,
  }) async {
    try {
      final raw = (dataUrl != null && dataUrl.isNotEmpty)
          ? dataUrl
          : (storageUrl ?? "");
      if (raw.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Không có đường dẫn file")),
        );
        return;
      }
      if (raw.startsWith("data:")) {
        final m = RegExp(r"^data:([^;]+);base64,(.+)$", dotAll: true).firstMatch(raw);
        if (m == null) throw Exception("dataUrl không hợp lệ");
        final bytes = base64Decode(m.group(2)!);
        final dir = await getTemporaryDirectory();
        final safe = name.replaceAll(RegExp(r"[^\w.\-]+"), "_");
        final path = "${dir.path}/$safe";
        await File(path).writeAsBytes(bytes, flush: true);
        await Share.shareXFiles([XFile(path)], text: name);
        return;
      }
      final full = raw.startsWith("http")
          ? raw
          : "${AppConfig.apiBaseUrl.replaceAll(RegExp(r"/$"), "")}$raw";
      final uri = Uri.parse(full);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Không mở được file")),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }

  Future<void> _previewDataImage(String dataUrl, String name) async {
    final m = RegExp(r"^data:image/[^;]+;base64,(.+)$", dotAll: true).firstMatch(dataUrl);
    if (m == null) {
      await _download(name: name, dataUrl: dataUrl);
      return;
    }
    final bytes = base64Decode(m.group(1)!);
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 4, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  IconButton(
                    tooltip: "Tải / mở",
                    onPressed: () => _download(name: name, dataUrl: dataUrl),
                    icon: const Icon(Icons.download_outlined),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(ctx),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(ctx).size.height * 0.7,
                maxWidth: MediaQuery.of(ctx).size.width * 0.92,
              ),
              child: InteractiveViewer(child: Image.memory(bytes)),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _actionChip({
    required IconData icon,
    required String label,
    required VoidCallback? onTap,
  }) {
    return ActionChip(
      avatar: Icon(icon, size: 18),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
      onPressed: _busy ? null : onTap,
      backgroundColor: const Color(0xFFF1F5F9),
      side: BorderSide.none,
    );
  }

  Widget _fileTile({
    required String name,
    required String subtitle,
    String? storageUrl,
    String? dataUrl,
    bool isImage = false,
  }) {
    final thumb = (dataUrl != null && dataUrl.startsWith("data:image/"))
        ? dataUrl
        : (storageUrl != null && storageUrl.startsWith("data:image/") ? storageUrl : null);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: thumb != null
          ? ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.memory(
                base64Decode(thumb.split(",").last),
                width: 44,
                height: 44,
                fit: BoxFit.cover,
                errorBuilder: (_, error, stackTrace) => const Icon(Icons.broken_image_outlined),
              ),
            )
          : CircleAvatar(
              backgroundColor: const Color(0xFFE8F1FF),
              child: Icon(
                isImage ? Icons.image_outlined : Icons.insert_drive_file_outlined,
                color: OasisTheme.admBlue,
                size: 20,
              ),
            ),
      title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 11, color: OasisTheme.muted)),
      trailing: IconButton(
        tooltip: "Tải xuống / mở",
        onPressed: () => _download(name: name, storageUrl: storageUrl, dataUrl: dataUrl),
        icon: const Icon(Icons.download_outlined),
      ),
      onTap: () {
        final raw = dataUrl ?? storageUrl ?? "";
        if (raw.startsWith("data:image/") ||
            (storageUrl != null && storageUrl.startsWith("data:image/"))) {
          _previewDataImage(raw.startsWith("data:") ? raw : storageUrl!, name);
        } else {
          _download(name: name, storageUrl: storageUrl, dataUrl: dataUrl);
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.stepIndex == null
        ? "Tệp & chứng từ"
        : "File hạng mục${widget.stepLabel != null ? " · ${widget.stepLabel}" : ""}";

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!widget.compact) ...[
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 4),
          const Text(
            "Chụp ảnh, chọn ảnh/PDF · Admin & Staff đều tải lên / tải về được.",
            style: TextStyle(fontSize: 12, color: OasisTheme.muted, height: 1.35),
          ),
          const SizedBox(height: 10),
        ],
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _actionChip(
              icon: Icons.photo_camera_outlined,
              label: "Camera",
              onTap: _uploadCamera,
            ),
            _actionChip(
              icon: Icons.photo_library_outlined,
              label: "Ảnh",
              onTap: _uploadGallery,
            ),
            _actionChip(
              icon: Icons.attach_file,
              label: "File / PDF",
              onTap: _uploadFile,
            ),
            if (_busy)
              const Padding(
                padding: EdgeInsets.only(left: 4, top: 8),
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_docs.isEmpty && _proofs.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Text(
              widget.stepIndex == null
                  ? "Chưa có file. Bấm Camera / File để đính kèm."
                  : "Chưa có file cho hạng mục này.",
              style: const TextStyle(color: OasisTheme.muted),
            ),
          )
        else ...[
          ..._proofs.map((p) {
            final name = p["name"]?.toString() ?? "proof.jpg";
            final dataUrl = p["dataUrl"]?.toString();
            final stepLabel = p["_stepLabel"]?.toString();
            return _fileTile(
              name: name,
              subtitle: [
                "Ảnh chứng từ",
                if (stepLabel != null && stepLabel.isNotEmpty) stepLabel,
              ].join(" · "),
              dataUrl: dataUrl,
              isImage: true,
            );
          }),
          ..._docs.map((d) {
            final name = d["fileName"]?.toString() ?? d["code"]?.toString() ?? "Tài liệu";
            final storage = d["storageUrl"]?.toString();
            final mime = d["mimeType"]?.toString() ?? "";
            final note = d["note"]?.toString() ?? "";
            final isImage = mime.startsWith("image/") ||
                name.toLowerCase().endsWith(".png") ||
                name.toLowerCase().endsWith(".jpg") ||
                name.toLowerCase().endsWith(".jpeg");
            return _fileTile(
              name: name,
              subtitle: [
                d["code"]?.toString(),
                if (note.isNotEmpty) note,
                d["createdAt"]?.toString().split("T").first,
              ].whereType<String>().where((e) => e.isNotEmpty).join(" · "),
              storageUrl: storage,
              dataUrl: storage != null && storage.startsWith("data:") ? storage : null,
              isImage: isImage,
            );
          }),
        ],
      ],
    );
  }
}
