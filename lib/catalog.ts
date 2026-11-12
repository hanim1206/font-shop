// 상품과 가격의 단일 출처. 클라이언트가 보낸 금액은 믿지 않고 서버가 항상 여기서 다시 계산한다.
// 라이선스는 지금 한 종류(개인·사업자 공통, 인쇄·영상·웹 이미지 등 콘텐츠 제작용)만 판다.

export type Product = {
  slug: string;
  family: string;
  style: string;
  weight: number;
  fontId: string; // fontmark --font-id. 마스터 버전과 묶이므로 판매 시작 후에는 바꾸지 않는다
  masterFile: string; // fonts/masters/ 아래 파일명 (서버 전용, 공개 폴더 아님)
  downloadName: string; // 구매자가 받는 파일명 (개인정보는 넣지 않는다)
  price: number;
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

export const LICENSE_LABEL = "기본 라이선스 (1인, 영구)";

export const PRODUCTS: Product[] = [
  {
    slug: "dummy-gothic-regular",
    family: "하님 더미고딕",
    style: "Regular",
    weight: 400,
    fontId: "HanimDummyGothic-Regular-1.000",
    masterFile: "HanimDummyGothic-Regular-1.000.ttf",
    downloadName: "HanimDummyGothic-Regular.ttf",
    price: 33000,
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
    price: 38000,
    sample: "다람쥐 헌 쳇바퀴에 타고파",
    description: "테스트용 더미 폰트입니다. 제목용 고딕 Bold.",
  },
];

export function findProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function orderNameOf(p: Product): string {
  return `${p.family} ${p.style} · ${LICENSE_LABEL}`;
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
