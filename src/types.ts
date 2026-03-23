export interface ProjectState {
  projectName: string;
  originalImage: string | null;
  generatedImages: GeneratedImage[];
  apiKey: string | null;
  analyzedPrompts: AnglePrompt[];
}

export type PromptCategory = 'Góc trung cảnh' | 'Góc cận cảnh' | 'Góc nội thất';

export interface AnglePrompt {
  angle: string;
  category: PromptCategory;
  prompt: string;
  imagePrompt: string;
  isGenerating?: boolean;
  resultImageUrl?: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  angle: string;
  category?: PromptCategory;
  timestamp: number;
}

export type AngleType = string;

export const ANGLE_PRESETS: string[] = [
  'Chính diện',
  'Góc chéo trái',
  'Góc chéo phải',
  'Cận cảnh mặt tiền',
  'Từ trên xuống',
  'Phối cảnh rộng',
  'Ban ngày',
  'Ban đêm',
  'Góc nghệ thuật',
  'Chi tiết decor',
  'Hoàng hôn',
  'Bình minh',
  'Nội thất sang trọng',
  'Góc nhìn mắt chim',
  'Góc nhìn mắt kiến',
  'Chi tiết vật liệu',
  'Ánh sáng tự nhiên',
  'Góc nhìn trừu tượng',
  'Góc nhìn điện ảnh',
  'Góc nhìn đen trắng'
];
