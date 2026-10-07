/** Static Mía Ơi menu — prices in VND (menu “50” = 50_000). */

export type MiaOiMenuItem = {
  id: string;
  category: string;
  nameVi: string;
  nameEn: string;
  /** Base price in VND */
  priceVnd: number;
  /** Optional second price (e.g. sữa hạt) */
  priceAltVnd?: number;
  priceAltLabel?: string;
  image: string;
};

export type MiaOiCategory = {
  id: string;
  nameVi: string;
  nameEn: string;
  image: string;
};

export const MIAOI_CATEGORIES: MiaOiCategory[] = [
  { id: "mia", nameVi: "Mía", nameEn: "Sugarcane", image: "/miaoi/mia.jpg" },
  { id: "cafe", nameVi: "Cà phê", nameEn: "Coffee", image: "/miaoi/cafe.jpg" },
  { id: "tra", nameVi: "Trà trái cây", nameEn: "Fresh Tea", image: "/miaoi/tra.jpg" },
  { id: "trasua", nameVi: "Trà sữa", nameEn: "Milk Tea", image: "/miaoi/trasua.jpg" },
  { id: "sinhto", nameVi: "Sinh tố / Đá xay", nameEn: "Smoothie", image: "/miaoi/sinhto.jpg" },
  { id: "matcha", nameVi: "Matcha", nameEn: "Matcha", image: "/miaoi/matcha.jpg" },
  { id: "topping", nameVi: "Topping", nameEn: "Topping", image: "/miaoi/items/topping.jpg" },
  { id: "khac", nameVi: "Khác", nameEn: "Others", image: "/miaoi/items/khac.jpg" },
];

const k = (n: number) => n * 1000;

export const MIAOI_MENU: MiaOiMenuItem[] = [
  // Mía
  { id: "mia-la-dua", category: "mia", nameVi: "Mía Lá Dứa", nameEn: "Sugarcane, Fresh Pandan", priceVnd: k(50), image: "/miaoi/items/mia-la-dua.jpg" },
  { id: "mia-thom", category: "mia", nameVi: "Mía Thơm", nameEn: "Sugarcane, Pineapple", priceVnd: k(50), image: "/miaoi/items/mia-thom.jpg" },
  { id: "mia-dau", category: "mia", nameVi: "Mía Dâu", nameEn: "Sugarcane, Strawberry", priceVnd: k(50), image: "/miaoi/items/mia-dau.jpg" },
  { id: "mia-quyt", category: "mia", nameVi: "Mía Quýt", nameEn: "Sugarcane, Tangerine", priceVnd: k(50), image: "/miaoi/items/mia-quyt.jpg" },
  { id: "mia-xi-muoi", category: "mia", nameVi: "Mía Xí Muội", nameEn: "Sugarcane, Dried Plum", priceVnd: k(50), image: "/miaoi/items/mia-xi-muoi.jpg" },
  { id: "mia-olong", category: "mia", nameVi: "Mía Olong", nameEn: "Sugarcane, Oolong Sea Salt Foam", priceVnd: k(50), image: "/miaoi/items/mia-olong.jpg" },
  { id: "mia-chanh-day", category: "mia", nameVi: "Mía Chanh Dây", nameEn: "Sugarcane, Passion Fruit", priceVnd: k(50), image: "/miaoi/items/mia-chanh-day.jpg" },
  { id: "mia-che", category: "mia", nameVi: "Mía Chè", nameEn: "Sugarcane, Sweet Soup", priceVnd: k(50), image: "/miaoi/items/mia-che.jpg" },
  // Cà phê
  { id: "cf-den", category: "cafe", nameVi: "Cà Phê Đen", nameEn: "Black Coffee", priceVnd: k(30), image: "/miaoi/items/cf-den.jpg" },
  { id: "cf-sua", category: "cafe", nameVi: "Cà Phê Sữa", nameEn: "Coffee with Condensed Milk", priceVnd: k(32), image: "/miaoi/items/cf-sua.jpg" },
  { id: "cf-americano", category: "cafe", nameVi: "Americano", nameEn: "Coffee with Hot Water", priceVnd: k(30), image: "/miaoi/items/cf-americano.jpg" },
  { id: "cf-la-dua", category: "cafe", nameVi: "Cà Phê Lá Dứa", nameEn: "Pandan Coffee", priceVnd: k(40), image: "/miaoi/items/cf-la-dua.jpg" },
  { id: "cf-bac-xiu", category: "cafe", nameVi: "Bạc Xỉu", nameEn: "Fresh Milk / Plant Milk", priceVnd: k(35), priceAltVnd: k(40), priceAltLabel: "Sữa hạt", image: "/miaoi/items/cf-bac-xiu.jpg" },
  { id: "cf-cacao", category: "cafe", nameVi: "Cacao Đá/Nóng", nameEn: "Ice / Hot Cocoa", priceVnd: k(40), image: "/miaoi/items/cf-cacao.jpg" },
  { id: "cf-hanh-nhan", category: "cafe", nameVi: "Cà Phê Hạnh Nhân", nameEn: "Almond Coffee", priceVnd: k(50), image: "/miaoi/items/cf-hanh-nhan.jpg" },
  { id: "cf-capu", category: "cafe", nameVi: "Capuchino Latte", nameEn: "Coffee with Milk", priceVnd: k(40), image: "/miaoi/items/cf-capu.jpg" },
  // Trà
  { id: "tra-dao", category: "tra", nameVi: "Trà Đào", nameEn: "Peach Tea", priceVnd: k(50), image: "/miaoi/items/tra-dao.jpg" },
  { id: "tra-oi", category: "tra", nameVi: "Trà Ổi", nameEn: "Guava Tea", priceVnd: k(50), image: "/miaoi/items/tra-oi.jpg" },
  { id: "tra-vai", category: "tra", nameVi: "Trà Vải", nameEn: "Lychee Tea", priceVnd: k(50), image: "/miaoi/items/tra-vai.jpg" },
  { id: "tra-dau", category: "tra", nameVi: "Trà Dâu", nameEn: "Strawberry Tea", priceVnd: k(50), image: "/miaoi/items/tra-dau.jpg" },
  { id: "tra-sen", category: "tra", nameVi: "Trà Sen", nameEn: "Lotus Tea", priceVnd: k(50), image: "/miaoi/items/tra-sen.jpg" },
  { id: "tra-thom", category: "tra", nameVi: "Trà Thơm", nameEn: "Pineapple Tea", priceVnd: k(50), image: "/miaoi/items/tra-thom.jpg" },
  { id: "tra-lai-nho", category: "tra", nameVi: "Trà Lài Nho Xanh Yuzu", nameEn: "Jasmine Green Grape Yuzu", priceVnd: k(50), image: "/miaoi/items/tra-lai-nho.jpg" },
  // Trà sữa
  { id: "ts-sen", category: "trasua", nameVi: "Trà Sữa Sen", nameEn: "Lotus Milk Tea", priceVnd: k(50), image: "/miaoi/items/ts-sen.jpg" },
  { id: "ts-olong", category: "trasua", nameVi: "Trà Sữa Olong Caramel", nameEn: "Oolong Caramel Milk Tea", priceVnd: k(50), image: "/miaoi/items/ts-olong.jpg" },
  { id: "ts-hanh-nhan", category: "trasua", nameVi: "Trà Sữa Hạnh Nhân", nameEn: "Almond Milk Tea", priceVnd: k(50), image: "/miaoi/items/ts-hanh-nhan.jpg" },
  { id: "ts-oreo", category: "trasua", nameVi: "Trà Sữa Oreo", nameEn: "Oreo Milk Tea", priceVnd: k(50), image: "/miaoi/items/ts-oreo.jpg" },
  { id: "ts-mo", category: "trasua", nameVi: "Trà Sữa Mơ", nameEn: "Apricot Milk Tea", priceVnd: k(50), image: "/miaoi/items/ts-mo.jpg" },
  // Sinh tố
  { id: "st-mia-oi", category: "sinhto", nameVi: "Mía Ổi", nameEn: "Sugarcane Guava Blended", priceVnd: k(50), image: "/miaoi/items/st-mia-oi.jpg" },
  { id: "st-bo", category: "sinhto", nameVi: "Sinh Tố Bơ", nameEn: "Avocado Smoothie", priceVnd: k(50), image: "/miaoi/items/st-bo.jpg" },
  { id: "st-colada", category: "sinhto", nameVi: "Mía Colada", nameEn: "Sugarcane Colada Blended", priceVnd: k(50), image: "/miaoi/items/st-colada.jpg" },
  { id: "st-dau", category: "sinhto", nameVi: "Sinh Tố Dâu", nameEn: "Strawberry Smoothie", priceVnd: k(50), image: "/miaoi/items/st-dau.jpg" },
  { id: "st-mojito", category: "sinhto", nameVi: "Mía Mojito", nameEn: "Sugarcane Mojito Blended", priceVnd: k(50), image: "/miaoi/items/st-mojito.jpg" },
  // Matcha
  { id: "matcha-sua", category: "matcha", nameVi: "Matcha Sữa Tươi/Sữa Hạt", nameEn: "Matcha Fresh / Plant Milk", priceVnd: k(50), priceAltVnd: k(55), priceAltLabel: "Sữa hạt", image: "/miaoi/items/matcha-sua.jpg" },
  // Topping
  { id: "tp-nha-dam", category: "topping", nameVi: "Nha Đam", nameEn: "Aloe Vera", priceVnd: k(10), image: "/miaoi/items/tp-nha-dam.jpg" },
  { id: "tp-suong-sao", category: "topping", nameVi: "Sương Sáo", nameEn: "Grass Jelly", priceVnd: k(10), image: "/miaoi/items/tp-suong-sao.jpg" },
  { id: "tp-tran-chau", category: "topping", nameVi: "Trân Châu Trắng", nameEn: "White Pearls", priceVnd: k(10), image: "/miaoi/items/tp-tran-chau.jpg" },
  { id: "tp-kem-muoi", category: "topping", nameVi: "Kem Muối", nameEn: "Sea Salt Cream", priceVnd: k(10), image: "/miaoi/items/tp-kem-muoi.jpg" },
  { id: "tp-pho-mai", category: "topping", nameVi: "Phô Mai Viên", nameEn: "Cheese Balls", priceVnd: k(10), image: "/miaoi/items/tp-pho-mai.jpg" },
  // Khác
  { id: "khac-sting", category: "khac", nameVi: "Sting", nameEn: "Sting", priceVnd: k(35), image: "/miaoi/items/khac-sting.jpg" },
  { id: "khac-coca", category: "khac", nameVi: "Coca", nameEn: "Coca", priceVnd: k(35), image: "/miaoi/items/khac-coca.jpg" },
  { id: "khac-7up", category: "khac", nameVi: "7up", nameEn: "7up", priceVnd: k(35), image: "/miaoi/items/khac-7up.jpg" },
  { id: "khac-revive", category: "khac", nameVi: "Revive", nameEn: "Revive", priceVnd: k(30), image: "/miaoi/items/khac-revive.jpg" },
  { id: "khac-suoi", category: "khac", nameVi: "Nước Suối", nameEn: "Bottled Water", priceVnd: k(20), image: "/miaoi/items/khac-suoi.jpg" },
];

export function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function formatMenuPrice(item: MiaOiMenuItem) {
  const base = Math.round(item.priceVnd / 1000);
  if (item.priceAltVnd) {
    return `${base}/${Math.round(item.priceAltVnd / 1000)}`;
  }
  return String(base);
}

export function getMiaOiItem(id: string) {
  return MIAOI_MENU.find((i) => i.id === id) || null;
}
