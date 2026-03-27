import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  LayoutDashboard, 
  FileText, 
  Image as ImageIcon, 
  Lightbulb, 
  Terminal, 
  Video, 
  Youtube,
  Plus,
  Loader2,
  TrendingUp,
  CheckCircle2,
  ChevronRight,
  Search,
  Trash2,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Topic, ScriptCut } from './types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const STEPS = [
  { id: '1-1', name: '소재 제안', icon: LayoutDashboard, color: 'text-amber-500' },
  { id: '1-2', name: '스토리 대본', icon: FileText, color: 'text-amber-500' },
  { id: '1-3', name: '소장품 대본', icon: Video, color: 'text-amber-500' },
  { id: '1-4', name: '참조 이미지', icon: ImageIcon, color: 'text-amber-500' },
  { id: '2-1', name: '클립 아이디어', icon: Lightbulb, color: 'text-blue-500' },
  { id: '2-2', name: '프롬프트 작성', icon: Terminal, color: 'text-blue-500' },
  { id: '4-1', name: 'YouTube 업로드', icon: Youtube, color: 'text-green-500' },
];

export default function App() {
  const [currentStep, setCurrentStep] = useState('1-1');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scripts, setScripts] = useState<Record<number, ScriptCut[]>>({});
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [collectionInfo, setCollectionInfo] = useState('');
  const [isGeneratingCollection, setIsGeneratingCollection] = useState(false);
  const [images, setImages] = useState<Record<number, any[]>>({});
  const [imagePagination, setImagePagination] = useState<Record<number, number>>({});
  const [selectedImages, setSelectedImages] = useState<Record<number, string>>({});
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [clipIdeas, setClipIdeas] = useState<Record<number, any[]>>({});
  const [selectedClipIdeas, setSelectedClipIdeas] = useState<Record<number, any>>({});
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [prompts, setPrompts] = useState<Record<number, string>>({});
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success'>('idle');
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState('');
  const [isSavingToSheet, setIsSavingToSheet] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const loadInitialTopics = async () => {
      try {
        const res = await fetch('/api/get-existing-topics');
        const data = await res.json();
        if (data.topics) {
          setTopics(data.topics);
        }
      } catch (err) {
        console.error("Failed to load initial topics:", err);
      }
    };
    loadInitialTopics();
  }, []);

  const saveToSheet = async () => {
    if (!selectedTopic || !scripts[selectedTopicIndex]) return;
    setIsSavingToSheet(true);
    try {
      const res = await fetch('/api/save-script-new-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: selectedTopic,
          script: scripts[selectedTopicIndex],
          title: titles[selectedTopicIndex]
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`새로운 시트('${data.sheetName}')에 성공적으로 저장되었습니다!`);
      } else {
        alert('저장 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error("Save to sheet error:", error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingToSheet(false);
    }
  };

  const selectedTopicIndex = topics.findIndex(t => t.상태 === '선택');
  const selectedTopic = selectedTopicIndex !== -1 ? topics[selectedTopicIndex] : null;

  const searchImages = async () => {
    if (!selectedTopic || !scripts[selectedTopicIndex]) return;
    setIsSearchingImages(true);
    try {
      const currentScript = scripts[selectedTopicIndex];
      const imageResults: Record<number, any[]> = {};
      const pagination: Record<number, number> = {};
      
      await Promise.all(currentScript.map(async (cut) => {
        const query = `${selectedTopic.인물_한글} ${cut.이미지키워드 || cut.자막}`;
        const res = await fetch(`/api/search-images?query=${encodeURIComponent(query)}&start=1`);
        const data = await res.json();
        imageResults[cut.컷] = (data.items || []).map((item: any) => ({
          url: item.url,
          title: item.title,
          source: item.source
        }));
        pagination[cut.컷] = 1;
      }));

      setImages(imageResults);
      setImagePagination(pagination);
      setCurrentStep('1-4');
    } catch (error) {
      console.error("Error searching images:", error);
    } finally {
      setIsSearchingImages(false);
    }
  };

  const loadMoreImages = async (cutNum: number) => {
    if (!selectedTopic) return;
    const currentScript = scripts[selectedTopicIndex];
    const cut = currentScript.find(c => c.컷 === cutNum);
    if (!cut) return;

    const nextStart = (imagePagination[cutNum] || 1) + 10;
    const query = `${selectedTopic.인물_한글} ${cut.이미지키워드 || cut.자막}`;
    
    try {
      const res = await fetch(`/api/search-images?query=${encodeURIComponent(query)}&start=${nextStart}`);
      const data = await res.json();
      const newImages = (data.items || []).map((item: any) => ({
        url: item.url,
        title: item.title,
        source: item.source
      }));

      setImages(prev => ({
        ...prev,
        [cutNum]: [...(prev[cutNum] || []), ...newImages]
      }));
      setImagePagination(prev => ({
        ...prev,
        [cutNum]: nextStart
      }));
    } catch (error) {
      console.error("Error loading more images:", error);
    }
  };

  const generateClipIdeas = async () => {
    if (!selectedTopic || !scripts[selectedTopicIndex]) return;
    setIsGeneratingIdeas(true);
    try {
      const currentScript = scripts[selectedTopicIndex];
      const selectedImgs = Object.entries(selectedImages).map(([cut, url]) => `Cut ${cut}: ${url}`).join('\n');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `다음 대본과 선택된 참조 이미지 정보를 바탕으로 각 컷을 어떻게 영상화할지 아이디어를 제안해줘.
        인물: ${selectedTopic.인물_한글}
        대본: ${JSON.stringify(currentScript)}
        선택된 이미지:
        ${selectedImgs}
        
        규칙:
        1. 각 컷당 2개의 시각화 아이디어를 제안해.
        2. 줌인, 패닝, 트랜지션 효과 등을 구체적으로 설명해.
        3. 선택된 이미지의 분위기를 반영해.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                컷: { type: Type.INTEGER },
                아이디어: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      방식: { type: Type.STRING },
                      설명: { type: Type.STRING }
                    },
                    required: ["방식", "설명"]
                  }
                }
              },
              required: ["컷", "아이디어"]
            }
          }
        }
      });

      const ideas = JSON.parse(response.text || '[]');
      const ideasMap: Record<number, any[]> = {};
      ideas.forEach((item: any) => {
        ideasMap[item.컷] = item.아이디어;
      });
      setClipIdeas(ideasMap);
      setCurrentStep('2-1');
    } catch (error) {
      console.error("Error generating clip ideas:", error);
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  const generatePrompts = async () => {
    if (!selectedTopic || !selectedClipIdeas) return;
    setIsGeneratingPrompts(true);
    try {
      const ideasContext = Object.entries(selectedClipIdeas).map(([cut, idea]: [string, any]) => `Cut ${cut}: ${idea.방식} - ${idea.설명}`).join('\n');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `다음 선택된 시각화 아이디어를 바탕으로 영상 생성 AI(Runway, Kling 등)에 입력할 영어 프롬프트를 작성해줘.
        인물: ${selectedTopic.인물_한글}
        아이디어:
        ${ideasContext}
        
        규칙:
        1. 영어로 작성할 것.
        2. 카메라 무빙, 분위기, 스타일을 구체적으로 포함할 것.
        3. 8~10번 컷은 소장품(Collection) 소개이므로 고급스럽고 박물관 같은 분위기를 강조해.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                컷: { type: Type.INTEGER },
                프롬프트: { type: Type.STRING }
              },
              required: ["컷", "프롬프트"]
            }
          }
        }
      });

      const generatedPrompts = JSON.parse(response.text || '[]');
      const promptMap: Record<number, string> = {};
      generatedPrompts.forEach((item: any) => {
        promptMap[item.컷] = item.프롬프트;
      });
      setPrompts(promptMap);
      setCurrentStep('2-2');
    } catch (error) {
      console.error("Error generating prompts:", error);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  const copyAllPrompts = () => {
    const allPrompts = Object.entries(prompts)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([cut, p]) => `Cut ${cut}: ${p}`)
      .join('\n\n');
    navigator.clipboard.writeText(allPrompts);
    alert('모든 프롬프트가 복사되었습니다.');
  };

  const handleUpload = async () => {
    setUploadStatus('uploading');
    try {
      const res = await fetch('/api/youtube-upload', { method: 'POST' });
      const data = await res.json();
      setUploadedVideoUrl(data.url);
      setUploadStatus('success');
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus('idle');
    }
  };

  const generateScript = async () => {
    if (!selectedTopic) return;
    setIsGeneratingScript(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `다음 소재를 바탕으로 7컷의 숏폼 영상 스토리 대본과 영상 상단에 고정될 제목을 작성해줘.

[제목 규칙]
1. 한국 시청자가 스크롤을 멈추게 만드는 자극적인 키워드 포함.
   (예: "전쟁", "포기", "충격", "반전", "비극", "억대연봉", "전성기")
2. 제목에 인물 이름(${selectedTopic.인물_한글}, ${selectedTopic.인물}) 절대 포함 금지.
3. 20자 이내, 숏폼 상단에 고정될 짧고 강렬한 문구.

[대본 구조 - 반드시 이 순서로]
- 1~2컷 (후킹): 시청자가 스크롤을 멈추게 만드는 장면이나 사실.
  날짜, 숫자, 충격적 상황으로 시작. 이 단계에서 인물 이름 절대 금지.
- 3~4컷 (전개): 인물의 배경과 선택의 맥락.
  대명사("그", "그녀", "이 남자", "이 여성")나 수식어로만 표현.
- 5~6컷 (클라이맥스): 가장 감동적이거나 충격적인 순간.
  이 중 정확히 한 컷에서 처음으로 인물 이름(${selectedTopic.인물_한글})을 공개.
- 7컷 (여운): 시청자가 울컥하거나 생각에 잠기게 만드는 마무리 문장.
  "기억합니다" 또는 "잊지 않겠습니다" 중 하나로 끝낼 것.

[자막 작성 규칙]
- 공백 포함 17자 이내 엄격 적용.
- 한 컷에 최대 2줄.
- 인용구는 실제 인터뷰나 공식 발언으로 확인된 것만 사용.
  출처가 불분명하면 인용구 없이 서술로 대체.
- "~했습니다" 체 과다 사용 금지. 짧고 끊어지는 문장 선호.
- 인물 이름이 5컷 이전에 등장하는 것 절대 금지.

[이미지 키워드]
각 컷마다 해당 장면을 검색할 수 있는 구체적인 이미지 키워드 제안.
인물 이름보다 상황 묘사 위주로.
(예: "1987년 런던 병원 에이즈 병동", "아프가니스탄 군복 미식축구 선수")

소재: ${JSON.stringify(selectedTopic)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              cuts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    컷: { type: Type.INTEGER },
                    자막: { type: Type.STRING },
                    이미지키워드: { type: Type.STRING },
                  },
                  required: ["컷", "자막", "이미지키워드"]
                }
              }
            },
            required: ["title", "cuts"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      if (data.cuts) {
        setScripts(prev => ({ ...prev, [selectedTopicIndex]: data.cuts }));
      }
      if (data.title) {
        setTitles(prev => ({ ...prev, [selectedTopicIndex]: data.title }));
      }
      setCurrentStep('1-2');
    } catch (error) {
      console.error("Error generating script:", error);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const generateCollectionScript = async () => {
    if (!selectedTopic || !collectionInfo) return;
    setIsGeneratingCollection(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `앞의 스토리 대본과 소장품 정보를 바탕으로 소장품 연결 컷(8번, 9번)을 작성해줘.

인물: ${selectedTopic.인물_한글}
핵심 가치: ${selectedTopic.가치}
소장품 정보: ${collectionInfo}

[핵심 원칙]
소장품은 단순한 물건이 아니라 앞의 서사의 물질적 증거야.
"이 물건이 이랜드 뮤지엄에 있다는 것"이 왜 의미 있는지를 감성적으로 전달해야 해.
앞의 스토리와 연결되는 고유한 문장을 써줘. 아래 템플릿 형식은 절대 사용 금지.

[컷 구성]
- 8번 컷: "이랜드 뮤지엄이 소장 중인 [소장품 명칭]."
- 9번 컷: 앞의 서사와 감성적으로 연결되는 고유한 문장 1줄.
  매 영상마다 다른 표현을 써줘.
  좋은 예시:
  "가장 빛나던 순간에 모든 것을 내려놓은 사람의 흔적입니다."
  "세상의 편견을 바꾼 악수, 그 온기가 담겨 있습니다."
  "전쟁을 멈춘 사나이의 땀이 배어 있는 유산입니다."
  사용 금지 예시:
  "[인물]의 [가치]를 기억합니다." 형태의 고정 템플릿

[자막 규칙]
- 공백 포함 20자 이내.
- "기억합니다"와 "잊지 않겠습니다"를 같은 영상에서 둘 다 쓰지 말 것.
- 9번 컷 마지막은 🙏 이모지로 마무리.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                컷: { type: Type.INTEGER },
                자막: { type: Type.STRING },
              },
              required: ["컷", "자막"]
            }
          }
        }
      });

      const collectionScript = JSON.parse(response.text || '[]');
      setScripts(prev => ({
        ...prev,
        [selectedTopicIndex]: [...(prev[selectedTopicIndex] || []).slice(0, 7), ...collectionScript]
      }));
      setCurrentStep('1-3');
    } catch (error) {
      console.error("Error generating collection script:", error);
    } finally {
      setIsGeneratingCollection(false);
    }
  };

  const updateScriptCut = (idx: number, newText: string) => {
    if (selectedTopicIndex === -1) return;
    setScripts(prev => ({
      ...prev,
      [selectedTopicIndex]: prev[selectedTopicIndex].map((cut, i) => 
        i === idx ? { ...cut, 자막: newText } : cut
      )
    }));
  };

  const generateTopics = async (keyword?: string) => {
    setIsGenerating(true);
    try {
      // Fetch existing anecdotes to avoid duplicates
      let existingAnecdotes: string[] = [];
      try {
        const existingRes = await fetch('/api/get-existing-topics');
        const existingData = await existingRes.json();
        existingAnecdotes = existingData.anecdotes || [];
      } catch (err) {
        console.error("Failed to fetch existing topics:", err);
      }

      const prompt = keyword 
        ? `1970~2010년대 서구권 대중문화(스포츠, 영화, 음악, 패션) 인물 중 "${keyword}"와(과) 관련된 숏폼 영상 소재 5개를 생성해줘.

[필수 조건 - 모두 충족해야 함]
1. 한국 관객이 감정적으로 반응할 수 있는 접점이 있어야 해.
   - 한국 방문 이력, 한국전쟁 참전, 한국인과의 접점, 또는
   - 애국심/희생/감동 서사가 한국 정서와 맞닿는 인물
2. 반전 포인트가 하나 이상 있어야 해.
   (예: 최고의 전성기에 모든 것을 포기 / 작은 행동 하나가 역사를 바꿈 / 편견에 맞선 행동)
3. 이랜드 뮤지엄 소장품(스포츠 유니폼, 사인 용품, 트로피, 드레스 등)과 연결 가능한 인물이어야 해.
4. 클릭을 유발하는 구체적인 숫자나 사실이 포함된 일화여야 해.
   (예: 360만 달러, 39번의 임무, 5년의 공백, 단 한 번의 악수)

[감성 분류 - 하나 선택]
- 애국/희생: 전성기를 포기하고 국가나 타인을 위해 헌신한 인물
- 인류애: 편견에 맞서 약자를 위해 행동한 인물
- 평화: 스포츠나 예술로 갈등이나 전쟁을 멈춘 인물
- 추모: 짧은 생애를 강렬하게 살다 간 인물

중요 규칙:
다음 리스트에 포함된 일화는 이미 사용되었으므로 절대 중복하지 말 것:
${existingAnecdotes.join(', ')}`
        : `1970~2010년대 서구권 대중문화(스포츠, 영화, 음악, 패션) 인물 중심의 숏폼 영상 소재 5개를 생성해줘.
분야 배분: 스포츠 2, 영화 1, 음악 1, 패션 또는 기타 1.

[필수 조건 - 모두 충족해야 함]
1. 한국 관객이 감정적으로 반응할 수 있는 접점이 있어야 해.
   - 한국 방문 이력, 한국전쟁 참전, 한국인과의 접점, 또는
   - 애국심/희생/감동 서사가 한국 정서와 맞닿는 인물
2. 반전 포인트가 하나 이상 있어야 해.
   (예: 최고의 전성기에 모든 것을 포기 / 작은 행동 하나가 역사를 바꿈 / 편견에 맞선 행동)
3. 이랜드 뮤지엄 소장품(스포츠 유니폼, 사인 용품, 트로피, 드레스 등)과 연결 가능한 인물이어야 해.
4. 클릭을 유발하는 구체적인 숫자나 사실이 포함된 일화여야 해.
   (예: 360만 달러, 39번의 임무, 5년의 공백, 단 한 번의 악수)

[감성 분류 - 하나 선택]
- 애국/희생: 전성기를 포기하고 국가나 타인을 위해 헌신한 인물
- 인류애: 편견에 맞서 약자를 위해 행동한 인물
- 평화: 스포츠나 예술로 갈등이나 전쟁을 멈춘 인물
- 추모: 짧은 생애를 강렬하게 살다 간 인물

중요 규칙:
다음 리스트에 포함된 일화는 이미 사용되었으므로 절대 중복하지 말 것:
${existingAnecdotes.join(', ')}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                분야: { type: Type.STRING },
                인물: { type: Type.STRING },
                인물_한글: { type: Type.STRING },
                감성: { type: Type.STRING },
                일화: { type: Type.STRING },
                가치: { type: Type.STRING },
                영상앵글: { type: Type.STRING },
                검색키워드: { type: Type.STRING, description: "인물 이름이 아닌, 이 일화의 핵심 주제나 사건과 관련된 검색어 (예: '마이클 조던의 독감 경기' -> 'NBA 독감 경기', '오드리 헵번의 유니세프 활동' -> '유니세프 구호 활동')" },
              },
              required: ["분야", "인물", "인물_한글", "감성", "일화", "가치", "영상앵글", "검색키워드"]
            }
          }
        }
      });

      const generatedTopics = JSON.parse(response.text || '[]');
      
      const topicsWithTrends = await Promise.all(generatedTopics.map(async (t: any) => {
        try {
          const trendsRes = await fetch(`/api/trends?keyword=${encodeURIComponent(t.검색키워드)}`);
          const trendsData = await trendsRes.json();
          
          const relatedRes = await fetch(`/api/related-queries?keyword=${encodeURIComponent(t.검색키워드)}`);
          const relatedData = await relatedRes.json();
          
          // Extract top rising related query
          const topQueries = relatedData.default?.rankedList?.[0]?.rankedKeyword || [];
          const risingQueries = relatedData.default?.rankedList?.[1]?.rankedKeyword || [];
          
          // Prefer rising, fallback to top
          const bestQuery = risingQueries.length > 0 ? risingQueries[0] : (topQueries.length > 0 ? topQueries[0] : null);

          const avgValue = trendsData.recentAverage || 0;
          const growthRate = trendsData.growthRate || 0;

          return {
            ...t,
            상태: '대기',
            인물지수: avgValue,
            연관키워드: bestQuery ? bestQuery.query : 'N/A',
            연관키워드지수: growthRate, // 상승률 (최근 7일 vs 이전 7일)
            급상승: (avgValue > 50 || growthRate > 100) ? '🔥' : ''
          };
        } catch (err) {
          console.error("Trends fetch error for", t.인물_한글, err);
          return { ...t, 상태: '대기', 인물지수: 0, 연관키워드: 'N/A', 연관키워드지수: 0 };
        }
      }));
      
      // Save suggested topics to '시트1'
      try {
        const saveRes = await fetch('/api/save-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topics: topicsWithTrends })
        });
        const saveData = await saveRes.json();
        if (!saveData.success) {
          console.error("Failed to save topics to sheet:", saveData.error, saveData.details);
          alert(`소재를 시트에 저장하는 데 실패했습니다.\n사유: ${saveData.error}\n상세: ${saveData.details || '없음'}`);
        }
      } catch (err) {
        console.error("Failed to save topics to sheet:", err);
      }

      setTopics(prev => [...topicsWithTrends, ...prev]);
    } catch (error) {
      console.error("Error generating topics:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTopicSelection = (index: number) => {
    setTopics(prev => prev.map((t, i) => 
      i === index ? { ...t, 상태: t.상태 === '선택' ? '대기' : '선택' } : { ...t, 상태: '대기' }
    ));
  };

  const deleteTopic = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const topicToDelete = topics[index];
    if (!confirm(`'${topicToDelete.인물_한글}' 소재를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch('/api/delete-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anecdote: topicToDelete.일화 })
      });
      const data = await res.json();
      if (data.success) {
        setTopics(prev => prev.filter((_, i) => i !== index));
      } else {
        alert('삭제 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (err) {
      console.error("Delete topic error:", err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-white overflow-hidden">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-card z-50">
        <h1 className="text-lg font-bold tracking-tighter flex items-center gap-2">
          <Video className="w-5 h-5 text-amber-500" />
          <span>V-Pipeline</span>
        </h1>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 text-white/70 hover:text-white"
        >
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-0 z-40 md:relative md:translate-x-0 transition-transform duration-300 ease-in-out",
        "w-64 border-r border-white/10 bg-card flex flex-col",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 hidden md:block">
          <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
            <Video className="w-6 h-6 text-amber-500" />
            <span>V-Pipeline</span>
          </h1>
        </div>
        
        <nav className="flex-1 px-4 py-4 md:py-0 space-y-1">
          {STEPS.map((step) => (
            <button
              key={step.id}
              onClick={() => {
                setCurrentStep(step.id);
                setIsSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                currentStep === step.id 
                  ? "bg-white/10 text-white" 
                  : "text-white/50 hover:text-white hover:bg-white/5"
              )}
            >
              <step.icon className={cn("w-4 h-4", step.color)} />
              {step.name}
              {currentStep === step.id && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-white/30 px-3 py-2">
            Logged in as: yimjb0516@gmail.com
          </div>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {currentStep === '1-1' && (
            <motion.div
              key="1-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">소재 제안</h2>
                  <p className="text-white/50 mt-1 text-sm md:text-base">AI가 제안하는 숏폼 영상 소재를 검토하고 선택하세요.</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="인물 또는 키워드 입력"
                      className="bg-white/5 border border-white/10 rounded-full px-6 py-3 text-sm focus:outline-none focus:border-amber-500/50 w-full sm:w-64 transition-all"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchKeyword.trim()) {
                          generateTopics(searchKeyword);
                        }
                      }}
                    />
                    {searchKeyword && (
                      <button 
                        onClick={() => setSearchKeyword('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => generateTopics(searchKeyword)}
                      disabled={isGenerating || !searchKeyword.trim()}
                      className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold px-4 py-3 rounded-full transition-all active:scale-95 border border-white/10 text-sm"
                    >
                      {isGenerating && searchKeyword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      검색 추천
                    </button>
                    <button
                      onClick={() => generateTopics()}
                      disabled={isGenerating}
                      className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold px-4 py-3 rounded-full transition-all active:scale-95 text-sm"
                    >
                      {isGenerating && !searchKeyword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      5개 생성
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-24">
                {topics.map((topic, idx) => (
                  <motion.div
                    key={idx}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => toggleTopicSelection(idx)}
                    className={cn(
                      "glass-card p-6 rounded-2xl cursor-pointer transition-all hover:border-amber-500/50 group relative overflow-hidden",
                      topic.상태 === '선택' && "border-amber-500 ring-1 ring-amber-500"
                    )}
                  >
                    {topic.상태 === '선택' && (
                      <div className="absolute top-4 right-4 text-amber-500">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                    )}
                    
                    <button
                      onClick={(e) => deleteTopic(e, idx)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-2 text-white/20 hover:text-red-500 transition-all z-10"
                      title="소재 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <div className="flex gap-2 mb-4">
                      <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                        {topic.분야}
                      </span>
                      <span className="px-2 py-1 rounded bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider">
                        {topic.감성}
                      </span>
                      {topic.급상승 && (
                        <span className="text-lg animate-bounce">{topic.급상승}</span>
                      )}
                    </div>

                    <h3 className="text-xl font-bold mb-2">{topic.인물_한글} <span className="text-white/30 text-sm font-normal">({topic.인물})</span></h3>
                    <p className="text-white/70 text-sm leading-relaxed mb-4">{topic.일화}</p>
                    
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">가치</span>
                        <span className="text-amber-500/80 italic font-serif">"{topic.가치}"</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-2 rounded-lg">
                          <div className="text-[10px] text-white/30 uppercase font-bold mb-1">인물 지수</div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-3 h-3 text-green-500" />
                            <span className="font-mono text-sm">{topic.인물지수}</span>
                          </div>
                        </div>
                        <div className="bg-white/5 p-2 rounded-lg">
                          <div className="text-[10px] text-white/30 uppercase font-bold mb-1">연관 키워드</div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs truncate max-w-[60px]">{topic.연관키워드}</span>
                            <span className="font-mono text-[10px] text-amber-500">+{topic.연관키워드지수}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {selectedTopic && (
                <motion.div 
                  initial={{ y: 100 }}
                  animate={{ y: 0 }}
                  className="fixed bottom-4 md:bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 flex items-center gap-4 bg-card/90 backdrop-blur-md border border-white/10 p-3 md:p-4 rounded-2xl shadow-2xl z-50"
                >
                  <div className="px-2 md:px-4 flex-1 md:flex-none">
                    <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Selected Topic</div>
                    <div className="font-bold text-sm md:text-base truncate max-w-[150px] md:max-w-none">{selectedTopic.인물_한글}</div>
                  </div>
                  <button
                    onClick={generateScript}
                    disabled={isGeneratingScript}
                    className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold px-4 md:px-8 py-3 rounded-xl transition-all active:scale-95 text-sm md:text-base"
                  >
                    {isGeneratingScript ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <FileText className="w-4 h-4 md:w-5 md:h-5" />}
                    대본 작성
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {currentStep === '1-2' && selectedTopic && (
            <motion.div
              key="1-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">스토리 대본 (7컷)</h2>
                  <p className="text-white/50 mt-1 text-sm md:text-base">
                    인물의 이름은 <span className="text-amber-500 font-bold">5~6번 컷</span>에서 등장하여 궁금증을 유발합니다.
                  </p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-lg self-start md:self-auto">
                  <span className="text-amber-500 font-bold text-xs md:text-sm">Step 1 of 2: Storytelling</span>
                </div>
              </div>

              {titles[selectedTopicIndex] && (
                <div className="glass-card p-6 rounded-2xl border-amber-500/30 bg-amber-500/5">
                  <div className="text-[10px] text-amber-500 uppercase font-bold tracking-widest mb-2">Recommended Video Title (Fixed Top)</div>
                  <input
                    type="text"
                    value={titles[selectedTopicIndex]}
                    onChange={(e) => setTitles(prev => ({ ...prev, [selectedTopicIndex]: e.target.value }))}
                    className="w-full bg-transparent border-none p-0 text-2xl font-black focus:ring-0 text-white placeholder:text-white/20"
                    placeholder="자극적인 제목이 여기에 표시됩니다..."
                  />
                </div>
              )}

              <div className="space-y-4">
                {scripts[selectedTopicIndex]?.slice(0, 7).map((cut, idx) => (
                  <div key={idx} className="glass-card p-3 md:p-4 rounded-xl flex items-start gap-3 md:gap-6 group">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-white/5 flex items-center justify-center text-amber-500 font-bold text-base md:text-lg shrink-0">
                      {cut.컷}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest">Caption</div>
                      <input
                        type="text"
                        value={cut.자막}
                        onChange={(e) => updateScriptCut(idx, e.target.value)}
                        className="w-full bg-transparent border-none p-0 text-lg md:text-xl font-medium focus:ring-0 text-white/90"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 md:gap-4 pt-8">
                <button
                  onClick={() => setCurrentStep('1-1')}
                  className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm md:text-base order-2 sm:order-1"
                >
                  이전으로
                </button>
                <button
                  onClick={() => setCurrentStep('1-3')}
                  className="px-8 py-3 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-600 transition-all active:scale-95 text-sm md:text-base order-1 sm:order-2"
                >
                  소장품 정보 입력하기
                </button>
              </div>
            </motion.div>
          )}

          {currentStep === '1-3' && selectedTopic && (
            <motion.div
              key="1-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">소장품 대본 작성</h2>
                <p className="text-white/50 mt-1 text-sm md:text-base">
                  박물관이 보유한 <span className="text-amber-500 font-bold">실물 소장품</span> 정보를 입력해 주세요.
                </p>
              </div>

              <div className="glass-card p-4 md:p-8 rounded-2xl space-y-6">
                <div className="space-y-2">
                  <label className="text-xs text-white/40 uppercase font-bold tracking-widest">Collection Details</label>
                  <textarea
                    value={collectionInfo}
                    onChange={(e) => setCollectionInfo(e.target.value)}
                    placeholder="예: 마이클 조던이 1996년 결승전에서 직접 착용한 에어 조던 11 브레드 모델"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 min-h-[120px] focus:border-amber-500 transition-colors outline-none"
                  />
                </div>
                
                <button
                  onClick={generateCollectionScript}
                  disabled={isGeneratingCollection || !collectionInfo}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold py-4 rounded-xl transition-all"
                >
                  {isGeneratingCollection ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                  소장품 자막 생성 (8~10번 컷)
                </button>
              </div>

              {scripts[selectedTopicIndex]?.length > 7 && (
                <div className="space-y-4 mt-8">
                  <h3 className="text-lg font-bold text-white/70 px-2">생성된 소장품 자막</h3>
                  {scripts[selectedTopicIndex].slice(7).map((cut, idx) => (
                    <div key={idx} className="glass-card p-3 md:p-4 rounded-xl flex items-start gap-3 md:gap-6 border-l-4 border-amber-500">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-white/5 flex items-center justify-center text-amber-500 font-bold text-base md:text-lg shrink-0">
                        {cut.컷}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest">
                          {cut.컷 === 10 ? 'Call to Action' : 'Collection Caption'}
                        </div>
                        <input
                          type="text"
                          value={cut.자막}
                          onChange={(e) => updateScriptCut(idx + 7, e.target.value)}
                          className="w-full bg-transparent border-none p-0 text-lg md:text-xl font-medium focus:ring-0 text-white/90"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-3 md:gap-4 pt-8">
                <button
                  onClick={() => setCurrentStep('1-2')}
                  className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm md:text-base order-3 sm:order-1"
                >
                  이전으로
                </button>
                <button
                  onClick={saveToSheet}
                  disabled={isSavingToSheet || scripts[selectedTopicIndex]?.length < 10}
                  className="px-6 py-3 rounded-xl border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center justify-center gap-2 text-sm md:text-base order-2 sm:order-2"
                >
                  {isSavingToSheet ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  시트 저장
                </button>
                <button
                  disabled={scripts[selectedTopicIndex]?.length < 10}
                  onClick={searchImages}
                  className="px-8 py-3 rounded-xl bg-amber-500 disabled:opacity-50 text-black font-bold hover:bg-amber-600 transition-all active:scale-95 text-sm md:text-base order-1 sm:order-3"
                >
                  {isSearchingImages ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : '참조 이미지 검색'}
                </button>
              </div>
            </motion.div>
          )}

          {currentStep === '1-4' && selectedTopic && (
            <motion.div
              key="1-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-6xl mx-auto space-y-8 pb-32"
            >
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">참조 이미지 선택</h2>
                <p className="text-white/50 mt-1 text-sm md:text-base">각 컷의 자막에 어울리는 이미지를 선택하세요.</p>
              </div>

              <div className="grid grid-cols-1 gap-8 md:gap-12">
                {scripts[selectedTopicIndex]?.map((cut) => (
                  <div key={cut.컷} className="space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 md:w-8 md:h-8 rounded bg-amber-500 text-black font-bold flex items-center justify-center text-xs md:text-base shrink-0 mt-1">{cut.컷}</span>
                      <span className="text-base md:text-lg font-medium leading-tight">{cut.자막}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                      {images[cut.컷]?.map((img, i) => (
                        <div 
                          key={i}
                          onClick={() => setSelectedImages(prev => ({ ...prev, [cut.컷]: img.url }))}
                          className={cn(
                            "relative aspect-video rounded-xl overflow-hidden cursor-pointer border-2 transition-all group/img",
                            selectedImages[cut.컷] === img.url ? "border-amber-500 scale-[1.02]" : "border-transparent opacity-60 hover:opacity-100"
                          )}
                        >
                          <img src={img.url} alt={img.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 text-[8px] md:text-[10px] truncate opacity-0 group-hover/img:opacity-100 transition-opacity">
                            {img.source}
                          </div>
                          {selectedImages[cut.컷] === img.url && (
                            <div className="absolute top-2 right-2 bg-amber-500 text-black rounded-full p-1 shadow-lg">
                              <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" />
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => loadMoreImages(cut.컷)}
                        className="aspect-video rounded-xl border-2 border-dashed border-white/10 hover:border-amber-500/50 hover:bg-white/5 flex flex-col items-center justify-center gap-1 md:gap-2 transition-all text-white/30 hover:text-amber-500"
                      >
                        <Plus className="w-4 h-4 md:w-6 md:h-6" />
                        <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Load More</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="fixed bottom-4 md:bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 flex items-center gap-4 bg-card/90 backdrop-blur-md border border-white/10 p-3 md:p-4 rounded-2xl shadow-2xl z-50">
                <button
                  onClick={() => setCurrentStep('1-3')}
                  className="px-4 md:px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm md:text-base"
                >
                  이전
                </button>
                <button
                  disabled={Object.keys(selectedImages).length < 10}
                  onClick={generateClipIdeas}
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-500 disabled:opacity-50 text-black font-bold px-4 md:px-8 py-3 rounded-xl transition-all active:scale-95 text-sm md:text-base"
                >
                  {isGeneratingIdeas ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Lightbulb className="w-4 h-4 md:w-5 md:h-5" />}
                  <span className="hidden sm:inline">클립 아이디어 생성</span>
                  <span className="sm:hidden">아이디어 생성</span>
                </button>
              </div>
            </motion.div>
          )}

          {currentStep === '2-1' && selectedTopic && (
            <motion.div
              key="2-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-4xl mx-auto space-y-8 pb-32"
            >
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-blue-500">클립 아이디어 제안</h2>
                <p className="text-white/50 mt-1 text-sm md:text-base">각 컷을 어떻게 영상화할지 아이디어를 선택하세요.</p>
              </div>

              <div className="space-y-6 md:space-y-8">
                {scripts[selectedTopicIndex]?.map((cut) => (
                  <div key={cut.컷} className="glass-card p-4 md:p-6 rounded-2xl space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 md:w-8 md:h-8 rounded bg-blue-500 text-white font-bold flex items-center justify-center text-xs md:text-base shrink-0 mt-1">{cut.컷}</span>
                      <span className="text-base md:text-lg font-medium leading-tight">{cut.자막}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      {clipIdeas[cut.컷]?.map((idea, i) => (
                        <div 
                          key={i}
                          onClick={() => setSelectedClipIdeas(prev => ({ ...prev, [cut.컷]: idea }))}
                          className={cn(
                            "p-3 md:p-4 rounded-xl cursor-pointer border-2 transition-all bg-white/5",
                            selectedClipIdeas[cut.컷] === idea ? "border-blue-500 bg-blue-500/10" : "border-transparent hover:bg-white/10"
                          )}
                        >
                          <div className="text-blue-500 font-bold text-xs md:text-sm mb-1">{idea.방식}</div>
                          <div className="text-xs md:text-sm text-white/70">{idea.설명}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="fixed bottom-4 md:bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 flex items-center gap-4 bg-card/90 backdrop-blur-md border border-white/10 p-3 md:p-4 rounded-2xl shadow-2xl z-50">
                <button
                  onClick={() => setCurrentStep('1-4')}
                  className="px-4 md:px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm md:text-base"
                >
                  이전
                </button>
                <button
                  disabled={Object.keys(selectedClipIdeas).length < 10}
                  onClick={generatePrompts}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-500 disabled:opacity-50 text-white font-bold px-4 md:px-8 py-3 rounded-xl transition-all active:scale-95 text-sm md:text-base"
                >
                  {isGeneratingPrompts ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Terminal className="w-4 h-4 md:w-5 md:h-5" />}
                  <span className="hidden sm:inline">AI 프롬프트 작성</span>
                  <span className="sm:hidden">프롬프트 작성</span>
                </button>
              </div>
            </motion.div>
          )}

          {currentStep === '2-2' && selectedTopic && (
            <motion.div
              key="2-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-4xl mx-auto space-y-8 pb-32"
            >
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-blue-500">AI 프롬프트 작성</h2>
                    <p className="text-white/50 mt-1 text-sm md:text-base">영상 생성 AI에 입력할 프롬프트입니다.</p>
                  </div>
                  <button 
                    onClick={copyAllPrompts}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-sm font-bold"
                  >
                    전체 복사
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {scripts[selectedTopicIndex]?.map((cut) => (
                  <div key={cut.컷} className="glass-card p-4 md:p-6 rounded-2xl flex flex-col md:flex-row items-start gap-4 md:gap-6">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-base md:text-lg shrink-0">
                      {cut.컷}
                    </div>
                    <div className="flex-1 w-full space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest">AI Prompt (English)</div>
                        <button 
                          onClick={() => navigator.clipboard.writeText(prompts[cut.컷])}
                          className="text-[10px] text-blue-500 hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                      <textarea
                        value={prompts[cut.컷]}
                        onChange={(e) => setPrompts(prev => ({ ...prev, [cut.컷]: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 text-xs md:text-sm font-mono focus:border-blue-500 outline-none min-h-[80px]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="fixed bottom-4 md:bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 flex items-center gap-4 bg-card/90 backdrop-blur-md border border-white/10 p-3 md:p-4 rounded-2xl shadow-2xl z-50">
                <button
                  onClick={() => setCurrentStep('2-1')}
                  className="px-4 md:px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm md:text-base"
                >
                  이전
                </button>
                <button
                  onClick={() => setCurrentStep('4-1')}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white font-bold px-4 md:px-8 py-3 rounded-xl transition-all active:scale-95 text-sm md:text-base"
                >
                  <Youtube className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden sm:inline">업로드 단계로 이동</span>
                  <span className="sm:hidden">업로드 이동</span>
                </button>
              </div>
            </motion.div>
          )}

          {currentStep === '4-1' && selectedTopic && (
            <motion.div
              key="4-1"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                  <Youtube className="w-8 h-8 md:w-10 md:h-10 text-green-500" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">YouTube 업로드</h2>
                <p className="text-white/50 text-sm md:text-base">완성된 영상을 유튜브에 비공개로 업로드합니다.</p>
              </div>

              <div className="glass-card p-4 md:p-8 rounded-3xl space-y-6">
                <div className="aspect-video bg-white/5 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-green-500/50 transition-colors cursor-pointer group p-4 text-center">
                  <Video className="w-10 h-10 md:w-12 md:h-12 text-white/20 group-hover:text-green-500 transition-colors mb-4" />
                  <span className="text-xs md:text-sm text-white/40">완성된 영상 파일을 선택하세요</span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-[10px] text-white/30 uppercase font-bold">Title</div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-xs md:text-sm truncate">
                      {selectedTopic.인물_한글}: {selectedTopic.가치}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-white/30 uppercase font-bold">Description</div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-[10px] md:text-xs text-white/60 whitespace-pre-line line-clamp-4 md:line-clamp-none">
                      {selectedTopic.일화}
                      {"\n\n"}#이랜드뮤지엄 #박물관 #숏폼 #{selectedTopic.인물_한글}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleUpload}
                  disabled={uploadStatus === 'uploading'}
                  className="w-full py-3 md:py-4 rounded-xl bg-green-500 text-white font-bold hover:bg-green-600 transition-all flex items-center justify-center gap-2 text-sm md:text-base"
                >
                  {uploadStatus === 'uploading' ? (
                    <>
                      <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                      업로드 중...
                    </>
                  ) : uploadStatus === 'success' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
                      업로드 완료
                    </>
                  ) : (
                    'YouTube 비공개 업로드'
                  )}
                </button>

                {uploadStatus === 'success' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center"
                  >
                    <div className="text-xs text-green-500 font-bold mb-1">Upload Successful!</div>
                    <a href={uploadedVideoUrl} target="_blank" rel="noreferrer" className="text-sm text-white hover:underline">
                      {uploadedVideoUrl}
                    </a>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
