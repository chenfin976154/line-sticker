
import React, { useState, useRef, useCallback } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Eraser, 
  Grid3X3, 
  Grid2X2, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileArchive
} from 'lucide-react';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { GoogleGenAI } from "@google/genai";
import { GridSize, ImageMetadata, ProcessingState } from './types';

// The library uses a named export 'removeBackground'
import { removeBackground } from '@imgly/background-removal';

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [gridSize, setGridSize] = useState<GridSize>('3x3');
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [processing, setProcessing] = useState<ProcessingState>({
    isRemovingBackground: false,
    progress: 0,
    isSlicing: false,
    isZipping: false
  });
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setMetadata({
          width: img.width,
          height: img.height,
          name: file.name,
          size: file.size
        });
        setOriginalImage(result);
        setProcessedImage(null);
        setProcessing(prev => ({ ...prev, progress: 0 }));
        setProcessingStatus('');
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const executeRemoveBackground = async () => {
    if (!originalImage) return;

    try {
      setProcessing(prev => ({ ...prev, isRemovingBackground: true, progress: 0 }));
      setProcessingStatus('正在準備 AI 引擎...');
      
      const blob = await removeBackground(originalImage, {
        progress: (status: string, progress: number) => {
          let statusText = '正在處理中...';
          let displayProgress = 0;

          // 修正進度計算邏輯
          if (status === 'fetch') {
            // 在下載階段，有些環境會回傳 Bytes 而非 0~1 的比例
            if (progress > 1) {
              const mbDownloaded = (progress / (1024 * 1024)).toFixed(1);
              statusText = `正在下載 AI 模型資源 (${mbDownloaded} MB)...`;
              displayProgress = 0; // 當無法取得總大小時，不顯示百分比數字，僅顯示狀態
            } else {
              displayProgress = Math.round(progress * 100);
              statusText = `正在下載 AI 模型資源...`;
            }
          } else if (status === 'compute') {
            statusText = '正在進行 AI 運算去背...';
            // 確保運算進度不超過 100
            displayProgress = Math.round(Math.min(progress, 1) * 100);
          }
          
          setProcessingStatus(statusText);
          setProcessing(prev => ({ 
            ...prev, 
            progress: displayProgress 
          }));
        }
      });

      setProcessing(prev => ({ ...prev, progress: 100 }));
      setProcessingStatus('完成！');

      const url = URL.createObjectURL(blob);
      setProcessedImage(url);
      setProcessing(prev => ({ ...prev, isRemovingBackground: false }));
    } catch (err) {
      console.error("Background removal error:", err);
      setError("去背失敗。這可能是因為照片格式不支援或瀏覽器記憶體不足，請嘗試縮小照片尺寸後重試。");
      setProcessing(prev => ({ ...prev, isRemovingBackground: false, progress: 0 }));
      setProcessingStatus('');
    }
  };

  const processAndDownload = async () => {
    if (!processedImage) return;

    setProcessing(prev => ({ ...prev, isSlicing: true, isZipping: true }));

    try {
      const img = new Image();
      img.src = processedImage;
      await new Promise((resolve) => { img.onload = resolve; });

      const gridCount = gridSize === '3x3' ? 3 : 4;
      const zip = new JSZip();

      const sliceWidth = img.width / gridCount;
      const sliceHeight = img.height / gridCount;

      const targetWidth = 370;
      const targetHeight = 320;

      for (let row = 0; row < gridCount; row++) {
        for (let col = 0; col < gridCount; col++) {
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          // Source coordinates
          const sx = col * sliceWidth;
          const sy = row * sliceHeight;

          // Calculate scaling to fit within 370x320 while maintaining aspect ratio
          const scale = Math.min(targetWidth / sliceWidth, targetHeight / sliceHeight);
          const drawWidth = sliceWidth * scale;
          const drawHeight = sliceHeight * scale;

          // Center position
          const dx = (targetWidth - drawWidth) / 2;
          const dy = (targetHeight - drawHeight) / 2;

          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, sx, sy, sliceWidth, sliceHeight, dx, dy, drawWidth, drawHeight);

          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (blob) {
            const index = row * gridCount + col + 1;
            zip.file(`sticker_${index}.png`, blob);
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      FileSaver.saveAs(content, `LINE_Stickers_${gridSize}_${Date.now()}.zip`);

      setProcessing(prev => ({ ...prev, isSlicing: false, isZipping: false }));
    } catch (err) {
      console.error("Processing error:", err);
      setError("製作貼圖包時發生錯誤。");
      setProcessing(prev => ({ ...prev, isSlicing: false, isZipping: false }));
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      <header className="bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-white p-1.5 rounded-lg">
              <ImageIcon className="text-green-600" size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">StickerMagic</h1>
          </div>
          <div className="text-sm bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
            LINE 貼圖自動產生器
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8 space-y-8">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-center gap-3 animate-in slide-in-from-top-4 duration-300">
            <AlertCircle className="text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-green-100 text-green-700 w-8 h-8 rounded-full flex items-center justify-center font-bold">1</span>
              <h2 className="text-lg font-bold text-gray-800">上傳照片</h2>
            </div>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer group flex flex-col items-center justify-center gap-3 min-h-[300px]
                ${originalImage ? 'border-green-200 bg-green-50/30' : 'border-gray-200 hover:border-green-400 hover:bg-green-50/10'}`}
            >
              {originalImage ? (
                <div className="w-full h-full flex flex-col items-center">
                  <img src={originalImage} alt="Original" className="max-h-64 rounded-lg shadow-sm mb-4 object-contain" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{metadata?.name}</p>
                    <div className="flex gap-4 mt-2 justify-center">
                      <span className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-600">尺寸: {metadata?.width} x {metadata?.height}</span>
                      <span className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-600">大小: {metadata ? formatSize(metadata.size) : ''}</span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setOriginalImage(null);
                      setProcessedImage(null);
                      setMetadata(null);
                      setProcessingStatus('');
                    }}
                    className="absolute top-2 right-2 bg-white/80 p-2 rounded-full text-gray-500 hover:text-red-500 transition-colors shadow-sm"
                  >
                    <Eraser size={20} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-green-100 p-4 rounded-full text-green-600 group-hover:scale-110 transition-transform">
                    <Upload size={32} />
                  </div>
                  <div className="text-center">
                    <p className="text-gray-700 font-medium">點擊或拖放照片</p>
                    <p className="text-gray-400 text-sm mt-1">支援 JPG, PNG 格式</p>
                  </div>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*"
              />
            </div>

            {originalImage && !processedImage && (
              <button
                onClick={executeRemoveBackground}
                disabled={processing.isRemovingBackground}
                className={`w-full mt-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
                  ${processing.isRemovingBackground ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-green-500 text-white hover:bg-green-600 active:scale-95 shadow-green-200'}`}
              >
                {processing.isRemovingBackground ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    正在處理中...
                  </>
                ) : (
                  <>
                    <Eraser size={20} />
                    執行 AI 自動去背
                  </>
                )}
              </button>
            )}
          </section>

          <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 min-h-[450px] transition-all hover:shadow-md flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-green-100 text-green-700 w-8 h-8 rounded-full flex items-center justify-center font-bold">2</span>
              <h2 className="text-lg font-bold text-gray-800">去背結果與預覽</h2>
            </div>

            <div className="flex-grow border border-gray-100 rounded-2xl bg-gray-50 flex flex-col items-center justify-center relative overflow-hidden">
              {processing.isRemovingBackground && (
                <div className="w-full px-8 text-center animate-in fade-in duration-500">
                  <div className="mb-2 text-green-600 font-black text-4xl tracking-tighter tabular-nums">
                    {processing.progress > 0 ? `${processing.progress}%` : <Loader2 className="animate-spin mx-auto" size={32} />}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden shadow-inner p-1">
                    <div 
                      className={`bg-gradient-to-r from-green-400 to-green-600 h-full transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] ${processing.progress === 0 ? 'animate-pulse w-full opacity-30' : ''}`} 
                      style={{ width: `${processing.progress || 100}%` }}
                    />
                  </div>
                  <p className="text-gray-600 text-sm font-medium animate-pulse">{processingStatus}</p>
                </div>
              )}

              {!processing.isRemovingBackground && processedImage ? (
                <div className="w-full h-full p-4 flex flex-col items-center justify-center animate-in zoom-in-95 duration-500">
                  <div className="relative group">
                    <img 
                      src={processedImage} 
                      alt="Processed" 
                      className="max-h-72 object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.1)]" 
                      style={{ backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 0)', backgroundSize: '16px 16px' }}
                    />
                    <div className="absolute inset-0 border-2 border-green-500/10 rounded-lg pointer-events-none group-hover:border-green-500/20 transition-all"></div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                    <CheckCircle2 size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Background Removed</span>
                  </div>
                </div>
              ) : !processing.isRemovingBackground && (
                <div className="text-center text-gray-400">
                  <ImageIcon size={48} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">去背後的照片會顯示在此</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {processedImage && (
          <section className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex items-center gap-2 mb-8">
              <span className="bg-green-100 text-green-700 w-8 h-8 rounded-full flex items-center justify-center font-bold">3</span>
              <h2 className="text-xl font-bold text-gray-800">設定與打包下載</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="col-span-1 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">選擇切割網格</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setGridSize('3x3')}
                      className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all
                        ${gridSize === '3x3' ? 'border-green-500 bg-green-50 text-green-600 shadow-sm' : 'border-gray-100 hover:border-gray-200 text-gray-500 bg-white'}`}
                    >
                      <Grid3X3 size={24} />
                      <span className="font-bold text-sm">3 x 3 (9張)</span>
                    </button>
                    <button 
                      onClick={() => setGridSize('4x4')}
                      className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all
                        ${gridSize === '4x4' ? 'border-green-500 bg-green-50 text-green-600 shadow-sm' : 'border-gray-100 hover:border-gray-200 text-gray-500 bg-white'}`}
                    >
                      <Grid2X2 size={24} />
                      <span className="font-bold text-sm">4 x 4 (16張)</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl space-y-2 border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">輸出規格詳情</p>
                  <ul className="text-xs text-gray-600 space-y-1.5">
                    <li className="flex justify-between items-center"><span className="opacity-60">單張尺寸</span> <span className="font-bold text-gray-700">370 x 320 px</span></li>
                    <li className="flex justify-between items-center"><span className="opacity-60">檔案格式</span> <span className="font-bold text-gray-700">透明 PNG</span></li>
                    <li className="flex justify-between items-center"><span className="opacity-60">打包方式</span> <span className="font-bold text-gray-700">ZIP 壓縮</span></li>
                  </ul>
                </div>
              </div>

              <div className="col-span-1 md:col-span-2 flex flex-col">
                <div className="flex-grow bg-gray-900 rounded-3xl p-8 text-white flex flex-col items-center justify-center relative overflow-hidden group">
                  <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-80 h-80 bg-green-500/10 rounded-full blur-[100px] transition-all group-hover:bg-green-500/20"></div>
                  <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] transition-all group-hover:bg-emerald-500/20"></div>

                  <div className="relative z-10 text-center space-y-6 max-w-sm">
                    <div className="mx-auto w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-green-400 shadow-inner group-hover:scale-110 transition-transform">
                      <FileArchive size={38} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">自動製作貼圖包</h3>
                      <p className="text-gray-400 text-sm mt-2 leading-relaxed font-medium">
                        系統將自動將去背後的圖片切割為 {gridSize === '3x3' ? '9' : '16'} 張小圖，並自動縮放置中符合 LINE 貼圖規格。
                      </p>
                    </div>
                    
                    <button
                      onClick={processAndDownload}
                      disabled={processing.isSlicing}
                      className="w-full py-4 px-8 bg-green-500 hover:bg-green-400 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-95 disabled:bg-gray-800 disabled:text-gray-600 shadow-[0_20px_40px_rgba(34,197,94,0.3)] hover:shadow-[0_20px_50px_rgba(34,197,94,0.4)]"
                    >
                      {processing.isSlicing ? (
                        <>
                          <Loader2 className="animate-spin" size={24} />
                          處理中...
                        </>
                      ) : (
                        <>
                          <Download size={24} />
                          下載 ZIP 打包檔
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-32 border-t border-gray-100 bg-white pt-16 pb-12">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="bg-green-100 p-2 rounded-xl">
                <ImageIcon className="text-green-600" size={24} />
              </div>
              <span className="font-black text-xl text-gray-900 tracking-tighter">StickerMagic</span>
            </div>
            <p className="text-gray-400 text-sm font-medium">© 2024 StickerMagic - 讓分享創意變得更簡單</p>
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-green-600 transition-colors text-sm font-bold">使用條款</a>
              <a href="#" className="text-gray-400 hover:text-green-600 transition-colors text-sm font-bold">隱私權政策</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
