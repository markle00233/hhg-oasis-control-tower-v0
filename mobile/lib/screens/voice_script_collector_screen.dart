import "package:flutter/material.dart";
import "package:permission_handler/permission_handler.dart";
import "package:provider/provider.dart";
import "package:speech_to_text/speech_to_text.dart" as stt;

import "../app_state.dart";
import "../theme.dart";
import "ai_task_summary_screen.dart";

/// Thu nhiều voice/manual script → Hoàn thành → GPT điền form Create Task.
class VoiceScriptCollectorScreen extends StatefulWidget {
  const VoiceScriptCollectorScreen({
    super.key,
    this.prefillOwner,
    this.prefillDeadline,
  });

  final String? prefillOwner;
  final DateTime? prefillDeadline;

  @override
  State<VoiceScriptCollectorScreen> createState() =>
      _VoiceScriptCollectorScreenState();
}

class _VoiceScriptCollectorScreenState extends State<VoiceScriptCollectorScreen> {
  final List<String> _scripts = [];
  final _speech = stt.SpeechToText();
  bool _speechReady = false;
  bool _listening = false;
  String _live = "";
  bool _busy = false;
  String? _localeId;
  String? _speechError;
  bool _retriedLocale = false;
  bool _openingManualFallback = false;

  @override
  void initState() {
    super.initState();
    _initSpeech();
  }

  String _friendlySpeechError(String raw) {
    final m = raw.toLowerCase();
    if (m.contains("error_unknown") || m.contains("(300)")) {
      return "Simulator/iOS không nhận giọng (error 300). "
          "Dùng Manual trên sim, hoặc test voice trên máy thật.";
    }
    if (m.contains("error_permission") || m.contains("permission")) {
      return "Thiếu quyền Micro / Speech Recognition trong Settings.";
    }
    if (m.contains("error_network") || m.contains("network")) {
      return "Speech cần mạng. Kiểm tra Wi‑Fi rồi thử lại.";
    }
    if (m.contains("error_no_match") || m.contains("no_match")) {
      return "Không nhận được lời nói. Nói rõ hơn hoặc dùng Manual.";
    }
    if (m.contains("error_speech_timeout") || m.contains("timeout")) {
      return "Hết thời gian chờ giọng nói. Bấm voice và nói ngay.";
    }
    return "Speech lỗi: $raw";
  }

  Future<bool> _ensurePermissions() async {
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      _speechError = "Chưa cấp quyền Micro. Vào Settings › Privacy › Microphone.";
      return false;
    }
    // iOS: Speech Recognition là quyền riêng.
    final speech = await Permission.speech.request();
    if (!speech.isGranted && !speech.isLimited) {
      _speechError =
          "Chưa cấp quyền Speech Recognition. Settings › Privacy › Speech Recognition.";
      return false;
    }
    return true;
  }

  Future<List<String>> _candidateLocales() async {
    final out = <String>[];
    try {
      final locales = await _speech.locales();
      for (final id in ["vi_VN", "vi-VN", "vi_VN", "en_US", "en-US"]) {
        final hit = locales.where((l) =>
            l.localeId == id ||
            l.localeId.replaceAll("-", "_").toLowerCase() ==
                id.replaceAll("-", "_").toLowerCase() ||
            (id.startsWith("vi") && l.localeId.toLowerCase().startsWith("vi")) ||
            (id.startsWith("en") && l.localeId.toLowerCase().startsWith("en")));
        if (hit.isNotEmpty) out.add(hit.first.localeId);
      }
      final sys = await _speech.systemLocale();
      if (sys != null) out.add(sys.localeId);
      for (final l in locales.take(6)) {
        out.add(l.localeId);
      }
    } catch (_) {
      out.addAll(["vi_VN", "en_US"]);
    }
    // unique preserve order
    final seen = <String>{};
    return out.where((e) => seen.add(e)).toList();
  }

  Future<void> _initSpeech() async {
    _speechError = null;
    final allowed = await _ensurePermissions();
    if (!allowed) {
      if (mounted) setState(() => _speechReady = false);
      return;
    }
    final ok = await _speech.initialize(
      onStatus: (s) {
        if (s == "done" || s == "notListening") {
          if (!mounted) return;
          setState(() => _listening = false);
          final done = _live.trim();
          if (done.isNotEmpty) {
            setState(() {
              _scripts.add(done);
              _live = "";
            });
          }
        }
      },
      onError: (e) {
        if (!mounted) return;
        final msg = _friendlySpeechError(e.errorMsg);
        setState(() {
          _listening = false;
          _speechError = msg;
        });
        // error 300 / permanent → mở manual ngay để không kẹt trên Simulator.
        final hard = e.permanent ||
            e.errorMsg.toLowerCase().contains("error_unknown") ||
            e.errorMsg.contains("300");
        if (hard) {
          _fallbackToManual(msg);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
        }
      },
    );
    if (!ok) {
      _speechError =
          "Không khởi tạo được Speech. Trên Simulator hãy dùng Manual; voice ổn định trên máy thật.";
    } else {
      final locales = await _candidateLocales();
      _localeId = locales.isEmpty ? null : locales.first;
    }
    if (mounted) setState(() => _speechReady = ok);
  }

  Future<void> _fallbackToManual(String reason) async {
    if (_openingManualFallback || !mounted) return;
    _openingManualFallback = true;
    try {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(reason)));
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (!mounted) return;
      await _addManual();
    } finally {
      _openingManualFallback = false;
    }
  }

  Future<void> _addManual() async {
    final text = await _promptScript(title: "Thêm script (manual)");
    if (text == null || text.isEmpty) return;
    setState(() => _scripts.add(text));
  }

  Future<void> _editScript(int index) async {
    final text = await _promptScript(
      title: "Sửa script ${index + 1}",
      initial: _scripts[index],
      confirmLabel: "Lưu",
    );
    if (text == null) return;
    if (text.isEmpty) {
      setState(() => _scripts.removeAt(index));
      return;
    }
    setState(() => _scripts[index] = text);
  }

  Future<String?> _promptScript({
    required String title,
    String initial = "",
    String confirmLabel = "Thêm",
  }) async {
    final ctrl = TextEditingController(text: initial);
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctrl,
          maxLines: 8,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: "Gõ / sửa nội dung script…",
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Huỷ")),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return text;
  }

  Future<void> _toggleVoice() async {
    if (_listening) {
      await _speech.stop();
      final done = _live.trim();
      setState(() {
        _listening = false;
        if (done.isNotEmpty) {
          _scripts.add(done);
          _live = "";
        }
      });
      return;
    }
    if (!_speechReady) {
      await _initSpeech();
      if (!_speechReady) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _speechError ??
                  "Chưa cấp quyền micro / speech. Có thể thêm bằng manual.",
            ),
          ),
        );
        return;
      }
    }
    if (!_speech.isAvailable) {
      await _initSpeech();
    }
    setState(() {
      _listening = true;
      _live = "";
      _speechError = null;
    });
    try {
      Future<bool> startWith(String? locale) async {
        final ok = await _speech.listen(
          onResult: (r) {
            if (!mounted) return;
            setState(() => _live = r.recognizedWords);
          },
          listenOptions: stt.SpeechListenOptions(
            localeId: locale,
            // confirmation ổn định hơn dictation trên iOS/Simulator.
            listenMode: stt.ListenMode.confirmation,
            cancelOnError: true,
            partialResults: true,
            autoPunctuation: true,
            listenFor: const Duration(seconds: 60),
            pauseFor: const Duration(seconds: 3),
          ),
        );
        return ok == true;
      }

      var started = await startWith(_localeId);
      if (started == false && !_retriedLocale) {
        _retriedLocale = true;
        final locales = await _candidateLocales();
        for (final loc in locales) {
          if (loc == _localeId) continue;
          started = await startWith(loc);
          if (started == true) {
            _localeId = loc;
            break;
          }
        }
        // Thử không ép locale (system default).
        if (started == false) {
          started = await startWith(null);
        }
      }
      if (started == false) {
        if (!mounted) return;
        setState(() => _listening = false);
        await _fallbackToManual(
          "Không bắt đầu ghi được trên Simulator. Hãy gõ manual (voice dùng máy thật).",
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _listening = false);
      await _fallbackToManual("Voice lỗi: $e — chuyển sang nhập manual.");
    }
  }

  Future<void> _showAddChooser() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.mic, color: Color(0xFF7C3AED)),
              title: const Text("Thêm bằng voice"),
              onTap: () => Navigator.pop(ctx, "voice"),
            ),
            ListTile(
              leading: const Icon(Icons.keyboard, color: Color(0xFF2563EB)),
              title: const Text("Thêm bằng manual"),
              onTap: () => Navigator.pop(ctx, "manual"),
            ),
          ],
        ),
      ),
    );
    if (choice == "manual") await _addManual();
    if (choice == "voice") await _toggleVoice();
  }

  Future<void> _finish() async {
    if (_busy) return;
    if (_listening) await _toggleVoice();
    if (_scripts.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Thêm ít nhất 1 script trước khi hoàn thành")),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final state = context.read<AppState>();
      final res = await state.parseTaskFromScripts(_scripts);
      if (!mounted) return;
      final task = Map<String, dynamic>.from(res["task"] as Map? ?? {});
      final source = res["source"]?.toString() ?? "";
      final hasKey = res["hasOpenAiKey"] == true;
      if (!mounted) return;

      if (!hasKey || source == "rule_based") {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              hasKey
                  ? "AI fallback rule-based (model lỗi). Kiểm tra OPENAI_MODEL / key."
                  : "Chưa có OPENAI_API_KEY trong .env — đang điền tạm bằng rule-based. Dán key rồi thử lại.",
            ),
            duration: const Duration(seconds: 4),
          ),
        );
      }

      // Tạm ẩn Create Task form — Admin xác nhận bảng tổng hợp AI rồi mới gửi staff.
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => AiTaskSummaryScreen(
            task: task,
            scripts: List<String>.from(_scripts),
            prefillOwner: widget.prefillOwner ?? task["owner"]?.toString(),
            prefillDeadline: widget.prefillDeadline,
            aiSource: source,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FC),
      appBar: AppBar(
        title: const Text(
          "Voice scripts",
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(
              "Thu đủ thông tin — có thể tách nhiều script. Xong bấm Hoàn thành để AI điền form giao task.",
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13, height: 1.35),
            ),
          ),
          if (!_speechReady && (_speechError ?? "").isNotEmpty)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF7ED),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFDBA74)),
              ),
              child: Text(
                _speechError!,
                style: const TextStyle(fontSize: 12.5, color: Color(0xFF9A3412), height: 1.35),
              ),
            ),
          if (_listening || _live.isNotEmpty)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF7C3AED).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF7C3AED).withValues(alpha: 0.35)),
              ),
              child: Row(
                children: [
                  Icon(
                    _listening ? Icons.graphic_eq : Icons.check_circle_outline,
                    color: const Color(0xFF7C3AED),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _live.isEmpty ? "Đang nghe…" : _live,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (_listening)
                    TextButton(
                      onPressed: _toggleVoice,
                      child: const Text("Lưu đoạn này"),
                    ),
                ],
              ),
            ),
          Expanded(
            child: Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFE2E8F0)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Text(
                        "Script box",
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                      ),
                      const Spacer(),
                      Text(
                        "${_scripts.length} đoạn",
                        style: const TextStyle(color: OasisTheme.muted, fontSize: 12),
                      ),
                      IconButton.filled(
                        tooltip: "Thêm script",
                        onPressed: _showAddChooser,
                        style: IconButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          foregroundColor: Colors.white,
                        ),
                        icon: const Icon(Icons.add),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: _scripts.isEmpty
                        ? Center(
                            child: Text(
                              "Chưa có script.\nBấm + để thêm bằng voice hoặc manual.",
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
                            ),
                          )
                        : ListView.separated(
                            itemCount: _scripts.length,
                            separatorBuilder: (_, _) => const SizedBox(height: 8),
                            itemBuilder: (context, i) {
                              return Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF8FAFC),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    CircleAvatar(
                                      radius: 12,
                                      backgroundColor: const Color(0xFF2563EB),
                                      child: Text(
                                        "${i + 1}",
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        _scripts[i],
                                        style: const TextStyle(height: 1.35),
                                      ),
                                    ),
                                    IconButton(
                                      tooltip: "Sửa",
                                      onPressed: () => _editScript(i),
                                      icon: const Icon(Icons.edit_outlined, size: 18),
                                    ),
                                    IconButton(
                                      tooltip: "Xoá",
                                      onPressed: () =>
                                          setState(() => _scripts.removeAt(i)),
                                      icon: const Icon(Icons.close, size: 18),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: FilledButton(
                onPressed: _busy ? null : _finish,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  backgroundColor: const Color(0xFF0F172A),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: _busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        "Hoàn thành · gửi AI điền form",
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
