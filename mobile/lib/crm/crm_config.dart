import "package:flutter/material.dart";

/// Ported from `hhgoasistonghop/src/config/crm.config.ts` — CRM V1 HHG Oasis.

class CrmComplex {
  static const name = "HHGO CRM";
  static const shortName = "HHGO";
}

class CrmServiceArea {
  const CrmServiceArea({required this.code, required this.name});
  final String code;
  final String name;
}

const crmServiceAreas = <CrmServiceArea>[
  CrmServiceArea(code: "RESORT", name: "Resort"),
  CrmServiceArea(code: "SPA", name: "Spa"),
  CrmServiceArea(code: "OLYMPIC", name: "Olympic / Bơi"),
  CrmServiceArea(code: "PICKLEBALL", name: "Pickleball"),
];

class CrmAreaTheme {
  const CrmAreaTheme({
    required this.solid,
    required this.soft,
    required this.text,
    required this.border,
    required this.label,
  });
  final Color solid;
  final Color soft;
  final Color text;
  final Color border;
  final String label;
}

const crmAreaThemes = <String, CrmAreaTheme>{
  "RESORT": CrmAreaTheme(
    solid: Color(0xFF0EA5E9),
    soft: Color(0xFFE0F2FE),
    text: Color(0xFF0369A1),
    border: Color(0xFFBAE6FD),
    label: "Resort",
  ),
  "SPA": CrmAreaTheme(
    solid: Color(0xFFEC4899),
    soft: Color(0xFFFCE7F3),
    text: Color(0xFFBE185D),
    border: Color(0xFFFBCFE8),
    label: "Spa",
  ),
  "OLYMPIC": CrmAreaTheme(
    solid: Color(0xFF10B981),
    soft: Color(0xFFD1FAE5),
    text: Color(0xFF047857),
    border: Color(0xFFA7F3D0),
    label: "Olympic / Bơi",
  ),
  "PICKLEBALL": CrmAreaTheme(
    solid: Color(0xFFF59E0B),
    soft: Color(0xFFFEF3C7),
    text: Color(0xFFB45309),
    border: Color(0xFFFDE68A),
    label: "Pickleball",
  ),
};

CrmAreaTheme crmAreaTheme(String? code) {
  if (code == null) {
    return const CrmAreaTheme(
      solid: Color(0xFF6B7280),
      soft: Color(0xFFF3F4F6),
      text: Color(0xFF374151),
      border: Color(0xFFE5E7EB),
      label: "Service",
    );
  }
  return crmAreaThemes[code.toUpperCase()] ??
      CrmAreaTheme(
        solid: const Color(0xFF6B7280),
        soft: const Color(0xFFF3F4F6),
        text: const Color(0xFF374151),
        border: const Color(0xFFE5E7EB),
        label: code,
      );
}

class CrmPackageGroupTheme {
  const CrmPackageGroupTheme({
    required this.bg,
    required this.text,
    required this.border,
    required this.label,
  });
  final Color bg;
  final Color text;
  final Color border;
  final String label;
}

const crmPackageGroupThemes = <String, CrmPackageGroupTheme>{
  "SWIM": CrmPackageGroupTheme(
    bg: Color(0xFFDBEAFE),
    text: Color(0xFF1E40AF),
    border: Color(0xFF93C5FD),
    label: "Gói Bơi thường",
  ),
  "PICK": CrmPackageGroupTheme(
    bg: Color(0xFFFFEDD5),
    text: Color(0xFF9A3412),
    border: Color(0xFFFDBA74),
    label: "Gói Pick thường",
  ),
  "VIP": CrmPackageGroupTheme(
    bg: Color(0xFFEDE9FE),
    text: Color(0xFF5B21B6),
    border: Color(0xFFC4B5FD),
    label: "Gói VIP Full",
  ),
};

class CrmMembershipPackage {
  const CrmMembershipPackage({
    required this.code,
    required this.name,
    required this.group,
    required this.durationDays,
    required this.priceMonth,
    required this.priceTotal,
    required this.description,
    required this.services,
  });
  final String code;
  final String name;
  final String group;
  final int durationDays;
  final int priceMonth;
  final int priceTotal;
  final String description;
  final List<String> services;
}

const crmMembershipPackages = <CrmMembershipPackage>[
  CrmMembershipPackage(
    code: "PKG_SWIM_1M",
    name: "Bơi · 1 tháng",
    group: "SWIM",
    durationDays: 30,
    priceMonth: 700000,
    priceTotal: 700000,
    description: "700.000đ/tháng · 700.000đ/gói",
    services: ["OLYMPIC"],
  ),
  CrmMembershipPackage(
    code: "PKG_SWIM_3M",
    name: "Bơi · 3 tháng",
    group: "SWIM",
    durationDays: 90,
    priceMonth: 600000,
    priceTotal: 1800000,
    description: "600.000đ/tháng · 1.800.000đ/gói · Tặng 1 tháng",
    services: ["OLYMPIC"],
  ),
  CrmMembershipPackage(
    code: "PKG_SWIM_6M",
    name: "Bơi · 6 tháng",
    group: "SWIM",
    durationDays: 180,
    priceMonth: 500000,
    priceTotal: 3000000,
    description: "500.000đ/tháng · 3.000.000đ/gói · Tặng 2 tháng",
    services: ["OLYMPIC"],
  ),
  CrmMembershipPackage(
    code: "PKG_SWIM_12M",
    name: "Bơi · 12 tháng",
    group: "SWIM",
    durationDays: 365,
    priceMonth: 450000,
    priceTotal: 5400000,
    description: "450.000đ/tháng · 5.400.000đ/gói · Tặng 3 tháng",
    services: ["OLYMPIC"],
  ),
  CrmMembershipPackage(
    code: "PKG_PICK_1M",
    name: "Pick · 1 tháng",
    group: "PICK",
    durationDays: 30,
    priceMonth: 600000,
    priceTotal: 600000,
    description: "Giá gốc 800.000 · 600.000đ/tháng · Tặng 2 vé bơi",
    services: ["PICKLEBALL"],
  ),
  CrmMembershipPackage(
    code: "PKG_PICK_3M",
    name: "Pick · 3 tháng",
    group: "PICK",
    durationDays: 90,
    priceMonth: 550000,
    priceTotal: 1650000,
    description: "Giá gốc 700.000 · 550.000đ/tháng · 1.650.000đ/gói · Tặng 6 vé bơi",
    services: ["PICKLEBALL"],
  ),
  CrmMembershipPackage(
    code: "PKG_PICK_6M",
    name: "Pick · 6 tháng",
    group: "PICK",
    durationDays: 180,
    priceMonth: 500000,
    priceTotal: 3000000,
    description: "Giá gốc 600.000 · 500.000đ/tháng · 3.000.000đ/gói · Tặng 12 vé bơi",
    services: ["PICKLEBALL"],
  ),
  CrmMembershipPackage(
    code: "PKG_PICK_12M",
    name: "Pick · 12 tháng",
    group: "PICK",
    durationDays: 365,
    priceMonth: 450000,
    priceTotal: 5400000,
    description: "Giá gốc 500.000 · 450.000đ/tháng · 5.400.000đ/gói · Tặng 24 vé bơi",
    services: ["PICKLEBALL"],
  ),
  CrmMembershipPackage(
    code: "PKG_VIP_1M",
    name: "VIP Full · 1 tháng",
    group: "VIP",
    durationDays: 30,
    priceMonth: 1000000,
    priceTotal: 1000000,
    description: "Giá gốc 1.200.000 · 1.000.000đ/tháng · Full dịch vụ",
    services: ["RESORT", "SPA", "OLYMPIC", "PICKLEBALL"],
  ),
  CrmMembershipPackage(
    code: "PKG_VIP_3M",
    name: "VIP Full · 3 tháng",
    group: "VIP",
    durationDays: 90,
    priceMonth: 900000,
    priceTotal: 2700000,
    description: "Giá gốc 1.100.000 · 900.000đ/tháng · 2.700.000đ/gói · Tặng 1 tháng",
    services: ["RESORT", "SPA", "OLYMPIC", "PICKLEBALL"],
  ),
  CrmMembershipPackage(
    code: "PKG_VIP_6M",
    name: "VIP Full · 6 tháng",
    group: "VIP",
    durationDays: 180,
    priceMonth: 800000,
    priceTotal: 4800000,
    description: "Giá gốc 1.000.000 · 800.000đ/tháng · 4.800.000đ/gói · Tặng 2 tháng",
    services: ["RESORT", "SPA", "OLYMPIC", "PICKLEBALL"],
  ),
  CrmMembershipPackage(
    code: "PKG_VIP_12M",
    name: "VIP Full · 12 tháng",
    group: "VIP",
    durationDays: 365,
    priceMonth: 650000,
    priceTotal: 7800000,
    description: "Giá gốc 900.000 · 650.000đ/tháng · 7.800.000đ/gói · Tặng 3 tháng",
    services: ["RESORT", "SPA", "OLYMPIC", "PICKLEBALL"],
  ),
];

const crmPackageGroupOrder = ["SWIM", "PICK", "VIP"];

const crmSalesPeople = <({String code, String name})>[
  (code: "SALE_A", name: "Anh A"),
  (code: "SALE_B", name: "Anh B"),
  (code: "SALE_C", name: "Anh C"),
];

String crmMoney(int n) {
  final s = n.toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    final fromEnd = s.length - i;
    buf.write(s[i]);
    if (fromEnd > 1 && fromEnd % 3 == 1) buf.write(".");
  }
  return "$bufđ";
}
