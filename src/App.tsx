/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Save, 
  FolderOpen, 
  Settings, 
  Undo2, 
  Redo2, 
  Upload, 
  Download, 
  RefreshCw, 
  Maximize2, 
  X, 
  Coffee,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { ProjectState, GeneratedImage, AngleType, ANGLE_PRESETS } from './types';

// --- Helpers ---
const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

// --- Custom Hooks ---

const useUndoRedo = (initialState: ProjectState) => {
  const [state, setState] = useState<ProjectState>(initialState);
  const [history, setHistory] = useState<ProjectState[]>([]);
  const [pointer, setPointer] = useState(-1);

  const updateState = useCallback((newState: ProjectState | ((prev: ProjectState) => ProjectState)) => {
    setState((prev) => {
      const resolvedState = typeof newState === 'function' ? newState(prev) : newState;
      const newHistory = history.slice(0, pointer + 1);
      newHistory.push(resolvedState);
      
      // Limit history size
      if (newHistory.length > 50) newHistory.shift();
      
      setHistory(newHistory);
      setPointer(newHistory.length - 1);
      return resolvedState;
    });
  }, [history, pointer]);

  const undo = useCallback(() => {
    if (pointer > 0) {
      const newPointer = pointer - 1;
      setPointer(newPointer);
      setState(history[newPointer]);
    }
  }, [history, pointer]);

  const redo = useCallback(() => {
    if (pointer < history.length - 1) {
      const newPointer = pointer + 1;
      setPointer(newPointer);
      setState(history[newPointer]);
    }
  }, [history, pointer]);

  return { state, setState: updateState, undo, redo, canUndo: pointer > 0, canRedo: pointer < history.length - 1 };
};

export default function App() {
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isBubbleOpen, setIsBubbleOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [numImages, setNumImages] = useState(1);
  const [aspectRatio, setAspectRatio] = useState('Auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [tempApiKey, setTempApiKey] = useState('');

  const { state, setState, undo, redo, canUndo, canRedo } = useUndoRedo({
    projectName: '',
    originalImage: null,
    generatedImages: [],
    apiKey: localStorage.getItem('archiviz_api_key') || null,
    analyzedPrompts: [],
  });

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            handleSave();
            break;
          case 'o':
            e.preventDefault();
            handleOpen();
            break;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, undo, redo]);

  // --- Zoom Logic ---
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(prev => Math.min(Math.max(prev + (e.deltaY < 0 ? 5 : -5), 50), 200));
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // --- Handlers ---
  const handleAnalyze = async () => {
    if (!state.originalImage) return;
    setIsAnalyzing(true);
    
    try {
      const apiKey = state.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('API Key missing');

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              data: state.originalImage.split(',')[1],
              mimeType: "image/png"
            }
          },
          {
            text: `Hãy phân tích ảnh kiến trúc này và tạo ra khoảng 30 prompt cực kỳ chi tiết, mang tính nghệ thuật cao cho các góc nhìn khác nhau. 
            YÊU CẦU QUAN TRỌNG: 
            - Giữ nguyên cấu trúc hình khối, vật liệu và cảnh quan cốt lõi của công trình gốc.
            - Các prompt phải mô tả ánh sáng điện ảnh (cinematic lighting), bối cảnh sang trọng, và chất lượng nhiếp ảnh kiến trúc cao cấp (high-end architectural photography).
            - Sử dụng các thuật ngữ chuyên môn như: golden hour, soft shadows, ray tracing, 8k resolution, photorealistic, vray style, v.v.

            Chia các prompt thành 3 nhóm chính:
            1. Góc trung cảnh: Các góc nhìn phối cảnh bao quát, drone view, chính diện, góc 45 độ... tập trung vào sự hùng vĩ và bối cảnh xung quanh.
            2. Góc cận cảnh: Chi tiết vật liệu (gỗ, đá, kính), các điểm chạm kiến trúc nghệ thuật, cận cảnh mặt tiền với ánh sáng đổ bóng tinh tế.
            3. Góc nội thất: Không gian bên trong, chiều sâu không gian, sự kết hợp giữa ánh sáng tự nhiên và nhân tạo, chi tiết decor cao cấp.
            
            Kết quả trả về DƯỚI DẠNG JSON ARRAY với cấu trúc: 
            [{"angle": "Tên góc nhìn nghệ thuật (tiếng Việt)", "category": "Góc trung cảnh" | "Góc cận cảnh" | "Góc nội thất", "prompt": "Mô tả góc nhìn đầy cảm hứng (tiếng Việt)", "imagePrompt": "Extremely detailed English prompt for high-end architectural visualization. Include camera settings (e.g., 35mm lens, f/8), specific lighting conditions, and emphasize maintaining the original structure and materials."}]`
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text);
      setState(prev => ({ ...prev, analyzedPrompts: result }));
    } catch (error) {
      console.error('Lỗi khi phân tích ảnh:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateImageWithPrompt = async (angle: string, imagePrompt: string) => {
    if (!state.originalImage) return;
    
    // Set loading state for specific row
    setState(prev => ({
      ...prev,
      analyzedPrompts: prev.analyzedPrompts.map(p => p.angle === angle ? { ...p, isGenerating: true } : p)
    }));
    
    try {
      const apiKey = state.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('API Key missing');

      const ai = new GoogleGenAI({ apiKey });
      
      // Generate a single image
      const model = ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            inlineData: {
              data: state.originalImage!.split(',')[1],
              mimeType: "image/png"
            }
          },
          {
            text: `${imagePrompt}${aspectRatio !== 'Auto' ? `. Aspect ratio: ${aspectRatio}` : ''}`
          }
        ]
      });

      const response = await model;
      const parts = response.candidates[0].content.parts;
      const imagePart = parts.find(p => p.inlineData);
      
      if (imagePart?.inlineData) {
        const url = `data:image/png;base64,${imagePart.inlineData.data}`;
        const newImage: GeneratedImage = {
          id: Math.random().toString(36).substr(2, 9),
          url,
          angle,
          timestamp: Date.now()
        };

        setState(prev => ({
          ...prev,
          generatedImages: [newImage, ...prev.generatedImages],
          analyzedPrompts: prev.analyzedPrompts.map(p => p.angle === angle ? { ...p, resultImageUrl: url } : p)
        }));
      }
    } catch (error) {
      console.error('Lỗi khi tạo ảnh:', error);
    } finally {
      setState(prev => ({
        ...prev,
        analyzedPrompts: prev.analyzedPrompts.map(p => p.angle === angle ? { ...p, isGenerating: false } : p)
      }));
    }
  };

  const updatePrompt = (angle: string, field: 'prompt' | 'imagePrompt', value: string) => {
    setState(prev => ({
      ...prev,
      analyzedPrompts: prev.analyzedPrompts.map(p => p.angle === angle ? { ...p, [field]: value } : p)
    }));
  };

  const handleSave = () => {
    const fileName = state.projectName ? `${slugify(state.projectName)}.json` : 'du-an-kien-truc.json';
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          try {
            const loadedState = JSON.parse(re.target?.result as string);
            setState(loadedState);
          } catch (err) {
            console.error('Lỗi khi mở file dự án', err);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => {
        setState(prev => ({ ...prev, originalImage: re.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const downloadImage = (url: string, index?: number) => {
    const a = document.createElement('a');
    a.href = url;
    const name = index !== undefined ? `${String(index + 1).padStart(2, '0')}.jpg` : 'architecture-view.jpg';
    a.download = name;
    a.click();
  };

  const downloadAll = () => {
    state.generatedImages.forEach((img, idx) => {
      setTimeout(() => downloadImage(img.url, idx), idx * 200);
    });
  };

  const saveApiKey = () => {
    localStorage.setItem('archiviz_api_key', tempApiKey);
    setState(prev => ({ ...prev, apiKey: tempApiKey }));
    setIsApiKeyModalOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden bg-zinc-950 text-zinc-100">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(24,24,27,1)_0%,rgba(9,9,11,1)_100%)] z-0" />
      
      {/* Scalable Content Area */}
      <div style={{ fontSize: `${zoom}%` }} className="flex-1 flex flex-col relative z-10">
        {/* --- Header --- */}
        <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
              <ImageIcon className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Đồng Bộ Dự Án</h1>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleSave} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors group relative text-zinc-400 hover:text-white" title="Lưu dự án (Ctrl+S)">
              <Save className="w-5 h-5" />
            </button>
            <button onClick={handleOpen} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors group relative text-zinc-400 hover:text-white" title="Mở dự án (Ctrl+O)">
              <FolderOpen className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-zinc-800 mx-2" />
            <button onClick={undo} disabled={!canUndo} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30 text-zinc-400 hover:text-white" title="Hoàn tác (Ctrl+Z)">
              <Undo2 className="w-5 h-5" />
            </button>
            <button onClick={redo} disabled={!canRedo} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30 text-zinc-400 hover:text-white" title="Làm lại (Ctrl+Shift+Z)">
              <Redo2 className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-zinc-800 mx-2" />
            <button 
              onClick={() => { setTempApiKey(state.apiKey || ''); setIsApiKeyModalOpen(true); }} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-900 transition-colors text-sm font-medium text-zinc-300"
            >
              <Settings className="w-4 h-4" />
              API Key
            </button>
          </div>
        </header>

        {/* --- Main Content --- */}
        <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* Left Column: Controls */}
            <div className="lg:col-span-4 space-y-8">
              <section className="space-y-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  1. Tải Lên Ảnh Gốc
                </h2>
                
                <div className="bg-zinc-900/50 rounded-3xl p-6 border border-zinc-800 space-y-6">
                  <label className="block relative aspect-video rounded-2xl border-2 border-dashed border-zinc-800 hover:border-blue-500/50 transition-colors cursor-pointer overflow-hidden group bg-zinc-950">
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    {state.originalImage ? (
                      <>
                        <img src={state.originalImage} alt="Original" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white font-medium">Thay đổi ảnh</span>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 space-y-2">
                        <ImageIcon className="w-12 h-12 opacity-20" />
                        <span className="text-sm font-medium">Tải ảnh kiến trúc gốc</span>
                      </div>
                    )}
                  </label>

                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-900/20"
                    >
                      Đổi Ảnh Khác
                    </button>
                    
                    <button 
                      onClick={handleAnalyze}
                      disabled={!state.originalImage || isAnalyzing}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center justify-center gap-2 font-bold disabled:opacity-50 shadow-lg shadow-blue-900/20"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-5 h-5" />
                      )}
                      {isAnalyzing ? 'ĐANG PHÂN TÍCH...' : 'Phân Tích & Tạo Prompt'}
                    </button>
                  </div>
                </div>

                {/* Settings */}
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-zinc-400">Tỷ lệ</label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-300 outline-none focus:border-blue-500 transition-colors appearance-none"
                    >
                      <option>Auto</option>
                      <option>1:1</option>
                      <option>16:9</option>
                      <option>9:16</option>
                      <option>4:3</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Prompt List */}
            <div className="lg:col-span-8 space-y-8">
              <h2 className="text-lg font-bold text-white">
                2. Danh Sách Prompt Đồng Bộ Dự Án
              </h2>

              {state.analyzedPrompts.length > 0 ? (
                <div className="space-y-12">
                  {['Góc trung cảnh', 'Góc cận cảnh', 'Góc nội thất'].map((category) => {
                    const categoryPrompts = state.analyzedPrompts.filter(p => p.category === category);
                    if (categoryPrompts.length === 0) return null;

                    return (
                      <div key={category} className="space-y-6">
                        <h3 className="text-blue-500 font-bold uppercase tracking-wider text-sm">
                          {category.toUpperCase()}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {categoryPrompts.map((item) => (
                            <div key={item.angle} className="bg-zinc-900/40 rounded-2xl border border-zinc-800/50 p-6 flex flex-col space-y-4 hover:border-blue-500/30 transition-all group">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-tight">{item.angle}</span>
                              </div>
                              
                              <div className="bg-black/40 rounded-xl p-4 border border-zinc-800/50 group-hover:border-zinc-700 transition-colors space-y-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Mô tả (Tiếng Việt)</label>
                                  <textarea
                                    value={item.prompt}
                                    onChange={(e) => updatePrompt(item.angle, 'prompt', e.target.value)}
                                    className="w-full bg-transparent text-sm text-zinc-300 leading-relaxed outline-none resize-none h-16 focus:text-white transition-colors"
                                    placeholder="Mô tả góc nhìn..."
                                  />
                                </div>
                                
                                <div className="pt-3 border-t border-zinc-800/50 space-y-1">
                                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">AI Prompt (English)</label>
                                  <textarea
                                    value={item.imagePrompt}
                                    onChange={(e) => updatePrompt(item.angle, 'imagePrompt', e.target.value)}
                                    className="w-full bg-transparent text-[11px] text-zinc-400 font-mono leading-relaxed outline-none resize-none h-32 focus:text-zinc-200 transition-colors"
                                    placeholder="English prompt for AI..."
                                  />
                                </div>
                              </div>

                              <div className="pt-2">
                                {item.resultImageUrl ? (
                                  <div className="relative aspect-video rounded-xl overflow-hidden mb-4 group/img">
                                    <img src={item.resultImageUrl} alt={item.angle} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                      <button onClick={() => setFullScreenImage(item.resultImageUrl!)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"><Maximize2 className="w-5 h-5" /></button>
                                      <button onClick={() => downloadImage(item.resultImageUrl!)} className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white"><Download className="w-5 h-5" /></button>
                                    </div>
                                  </div>
                                ) : null}

                                <button
                                  onClick={() => generateImageWithPrompt(item.angle, item.imagePrompt)}
                                  disabled={isGenerating || item.isGenerating}
                                  className="w-full py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-2 text-xs font-bold border border-zinc-700/50"
                                >
                                  {item.isGenerating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4" />
                                  )}
                                  Tạo Ảnh Này
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-900 rounded-3xl">
                  <Settings className="w-12 h-12 opacity-10 mb-4" />
                  <p className="text-sm font-medium">Chưa có dữ liệu phân tích. Hãy tải ảnh và nhấn Phân Tích.</p>
                </div>
              )}
            </div>
          </div>

          {/* Gallery Section */}
          {state.generatedImages.length > 0 && (
            <section className="mt-24 space-y-8">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-blue-500" />
                  Thư Viện Kết Quả
                </h2>
                <button onClick={downloadAll} className="text-sm font-bold text-blue-500 hover:text-blue-400 transition-colors flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Tải về tất cả ({state.generatedImages.length})
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                <AnimatePresence mode="popLayout">
                  {state.generatedImages.map((img, idx) => (
                    <motion.div
                      key={img.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-zinc-900 rounded-2xl overflow-hidden group border border-zinc-800"
                    >
                      <div className="relative aspect-video overflow-hidden">
                        <img src={img.url} alt={img.angle} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button onClick={() => setFullScreenImage(img.url)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"><Maximize2 className="w-4 h-4" /></button>
                          <button onClick={() => downloadImage(img.url, idx)} className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white"><Download className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div className="p-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{img.angle}</span>
                        <span className="text-[10px] text-zinc-600">{new Date(img.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
        </main>

        {/* --- Footer --- */}
        <footer className="py-12 text-center border-t border-zinc-900 mt-12">
          <p className="text-zinc-600 text-xs font-medium">
            Prompting by <a href="https://xizital.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Xizital</a>
          </p>
        </footer>
      </div>

      {/* --- Fixed UI Elements (Not Scaled) --- */}
      
      {/* Zoom Indicator */}
      <div className="fixed top-20 right-6 z-30 flex items-center gap-3 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 px-4 py-2 rounded-full shadow-lg text-sm">
        <span className="font-medium text-zinc-300">{zoom}%</span>
        <button onClick={() => setZoom(100)} className="p-1 hover:bg-zinc-800 rounded-full transition-colors" title="Reset Zoom">
          <RotateCcw className="w-4 h-4 text-blue-500" />
        </button>
      </div>

      {/* Floating Bubble */}
      <div className="fixed bottom-8 right-8 z-50">
        <button 
          onClick={() => setIsBubbleOpen(!isBubbleOpen)}
          className="w-14 h-14 rounded-full bg-blue-600 shadow-2xl flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-95"
        >
          <Coffee className="w-6 h-6" />
        </button>
        
        <AnimatePresence>
          {isBubbleOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-20 right-0 w-72 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="text-center space-y-2">
                <h4 className="font-bold text-white">Mời Xizital ly cà phê</h4>
                <p className="text-xs text-zinc-500">Nếu bạn thấy những chia sẻ này hữu ích!</p>
              </div>
              <div className="aspect-square rounded-2xl overflow-hidden border border-zinc-800">
                <img 
                  src="https://xizital.com/wp-content/uploads/2025/10/z7084477223291_1aa5f551f0f549b6d3d1d72d70e3d4e4.jpg" 
                  alt="QR Coffee" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="text-[10px] text-center text-zinc-600 italic">
                Đổi nội dung bong bóng này tùy theo nhu cầu của bạn.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isApiKeyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsApiKeyModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Quản lý API Key</h3>
                <button onClick={() => setIsApiKeyModalOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">Nhập API key Gemini của bạn để sử dụng các tính năng tạo ảnh cao cấp.</p>
                <input 
                  type="password" 
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="Dán API Key tại đây..."
                  className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-blue-500 outline-none transition-all text-white"
                />
                <button onClick={saveApiKey} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/20">
                  LƯU API KEY
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fullScreenImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 md:p-12">
            <button 
              onClick={() => setFullScreenImage(null)}
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              src={fullScreenImage} 
              alt="Full view" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
