// 상품과 가격의 단일 출처. 클라이언트가 보낸 금액은 믿지 않고 서버가 항상 여기서 다시 계산한다.
// 라이선스는 2종: Desktop(설치용 OTF/TTF) · Web(웹폰트 WOFF/WOFF2, 도메인 1개). 웨이트 하나당 가격이 따로 있다.

export type Product = {
  slug: string;
  family: string;
  style: string;
  weight: number;
  fontId: string; // fontmark --font-id. 마스터 버전과 묶이므로 판매 시작 후에는 바꾸지 않는다
  masterFile: string; // fonts/masters/ 아래 파일명 (서버 전용, 공개 폴더 아님)
  downloadName: string; // 구매자가 받는 파일명 (개인정보는 넣지 않는다)
  prices: Record<LicenseType, number>;
  sample: string;
  description: string;
};

// 사이트 하단 사업자 정보 (전자상거래법상 표시 의무). 지금은 더미.
export const SELLER = {
  name: "하니무스 (더미)",
  bizNo: "000-00-00000 (더미)",
  mailOrderNo: "제0000-서울-0000호 (더미)",
  email: process.env.NEXT_PUBLIC_SELLER_EMAIL || "seller@example.com",
};

export type LicenseType = "desktop" | "web";

export const LICENSES: Record<LicenseType, { label: string; desc: string; formats: string[] }> = {
  desktop: {
    label: "Desktop",
    desc: "PC에 설치해서 인쇄물, 영상, 이미지, 로고·CI/BI 제작 · PC 1대 · 영구",
    formats: ["otf/ttf"], // 마스터와 같은 형식
  },
  web: {
    label: "Web",
    desc: "웹사이트에 웹폰트로 임베딩 · 도메인 1개 · 영구",
    formats: ["woff", "woff2"],
  },
};
export const LICENSE_TYPES = Object.keys(LICENSES) as LicenseType[];
export const isLicenseType = (v: unknown): v is LicenseType => typeof v === "string" && v in LICENSES;

export const PRODUCTS: Product[] = [
  {
    slug: "dummy-gothic-regular",
    family: "하님 더미고딕",
    style: "Regular",
    weight: 400,
    fontId: "HanimDummyGothic-Regular-1.000",
    masterFile: "HanimDummyGothic-Regular-1.000.ttf",
    downloadName: "HanimDummyGothic-Regular.ttf",
    prices: { desktop: 33000, web: 55000 },
    sample: "다람쥐 헌 쳇바퀴에 타고파",
    description: "테스트용 더미 폰트입니다. 본문용 고딕 Regular.",
  },
  {
    slug: "dummy-gothic-bold",
    family: "하님 더미고딕",
    style: "Bold",
    weight: 700,
    fontId: "HanimDummyGothic-Bold-1.000",
    masterFile: "HanimDummyGothic-Bold-1.000.ttf",
    downloadName: "HanimDummyGothic-Bold.ttf",
    prices: { desktop: 38000, web: 63000 },
    sample: "다람쥐 헌 쳇바퀴에 타고파",
    description: "테스트용 더미 폰트입니다. 제목용 고딕 Bold.",
  },
];

export function findProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export const itemNameOf = (p: Product, license: LicenseType) => `${p.family} ${p.style} · ${LICENSES[license].label}`;

export const MAX_CART_ITEMS = 10; // 결제 후 항목마다 워터마크를 넣으므로(항목당 수 초) 한 주문의 상한

export type CartItem = { slug: string; license: LicenseType };
export type PricedItem = CartItem & { product: Product; name: string; price: number };

/** 장바구니를 서버 카탈로그로 다시 계산한다. 잘못된 항목·중복·상한 초과면 error. */
export function priceCart(raw: unknown): { items: PricedItem[]; total: number } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "EMPTY_CART" };
  if (raw.length > MAX_CART_ITEMS) return { error: "TOO_MANY_ITEMS" };
  const seen = new Set<string>();
  const items: PricedItem[] = [];
  for (const r of raw) {
    const product = findProduct(String(r?.slug));
    const license: unknown = r?.license;
    if (!product || !isLicenseType(license)) return { error: "INVALID_ITEM" };
    const key = `${product.slug}:${license}`;
    if (seen.has(key)) return { error: "DUPLICATE_ITEM" };
    seen.add(key);
    items.push({ slug: product.slug, license, product, name: itemNameOf(product, license), price: product.prices[license] });
  }
  return { items, total: items.reduce((s, i) => s + i.price, 0) };
}

export function orderNameOf(items: { name: string }[]): string {
  // 토스 orderName 은 100자 이내
  const first = items[0].name;
  return (items.length > 1 ? `${first} 외 ${items.length - 1}건` : first).slice(0, 100);
}

/** 브라우저(장바구니 화면)에 넘겨도 되는 상품 정보만. 마스터 파일명·fontId 는 빼고 준다. */
export function publicCatalog() {
  return PRODUCTS.map((p) => ({ slug: p.slug, family: p.family, style: p.style, prices: p.prices }));
}
export type PublicProduct = ReturnType<typeof publicCatalog>[number];

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

// 도메인 1개: 스킴·경로 없이 example.com 형태로 저장한다
export function normalizeDomain(raw: unknown): string | null {
  let d = String(raw ?? "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return /^(?=.{3,253}$)([a-z0-9가-힣](-*[a-z0-9가-힣])*\.)+[a-z가-힣]{2,}$/.test(d) ? d : null;
}
