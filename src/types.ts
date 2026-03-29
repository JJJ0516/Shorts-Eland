export interface Topic {
  분야: string;
  인물: string;
  인물_한글: string;
  감성: string;
  일화: string;
  가치: string;
  영상앵글: string;
  검색키워드: string;
  핵심키워드: string;
  인물지수?: number;
  연관키워드?: string;
  연관키워드지수?: number;
  급상승?: string;
  상태: '대기' | '선택' | '완료' | '보류';
}

export interface ScriptCut {
  컷: number;
  자막: string;
  이미지키워드: string;
}

export interface PipelineState {
  topics: Topic[];
  selectedTopicId: number | null;
  scripts: Record<number, ScriptCut[]>;
}
