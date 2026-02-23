/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Upload, 
  Sparkles, 
  Video, 
  Volume2, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ShoppingBag,
  Download,
  RefreshCw,
  Play,
  Pause
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductInfo {
  name: string;
  description: string;
  features: string[];
  script: string;
  headline: string;
  animationType: 'panning' | 'bouncing' | 'vibrating' | 'sliding';
}

export default function App() {
  const [mediaSource, setMediaSource] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
  const [userProductDescription, setUserProductDescription] = useState("");
  const [manualHeadline, setManualHeadline] = useState("");
  const [manualScript, setManualScript] = useState("");
  const [activeScriptType, setActiveScriptType] = useState<'auto' | 'manual'>('auto');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [useBackgroundMusic, setUseBackgroundMusic] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  const SHOPEE_ORANGE = "#EE4D2D";
  const BGM_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; // More stable public URL

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      const url = URL.createObjectURL(file);
      setMediaSource({ url, type });
      setProductInfo(null);
      setAudioUrl(null);
      setVideoBlobUrl(null);
      setError(null);
    }
  };

  const analyzeProduct = async () => {
    if (!mediaSource) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      let base64Data = "";
      let mimeType = "image/jpeg";

      if (mediaSource.type === 'image') {
        const response = await fetch(mediaSource.url);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });
      } else {
        // Extract frame from video
        const video = document.createElement('video');
        video.src = mediaSource.url;
        video.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          video.onloadeddata = () => {
            video.currentTime = 1; // Seek to 1 second
          };
          video.onseeked = resolve;
        });

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
      }

      const userContext = userProductDescription 
        ? `O usuário descreveu o produto como: "${userProductDescription}". Use esta informação para ser mais preciso.`
        : "";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            {
              text: `Analise este produto da Shopee. ${userContext}
              Retorne um JSON com os seguintes campos:
              - name: Nome do produto
              - description: Descrição curta
              - features: 3 características
              - headline: Uma frase de impacto inicial (ex: "Olha o que achei na Shopee!")
              - script: Um roteiro de vendas curto e animado (máximo 15 segundos) que comece com a headline.
              - animationType: Escolha entre 'panning', 'bouncing', 'vibrating' ou 'sliding'.
              Responda APENAS o JSON.`,
            },
          ],
        },
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.text || "{}");
      setProductInfo(data);
      setManualHeadline(data.headline || "");
      setManualScript(data.script || "");
    } catch (err: any) {
      console.error("Analysis Error:", err);
      setError(`Erro na análise: ${err.message || "Verifique sua GEMINI_API_KEY no Vercel."}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateAudio = async () => {
    const scriptToUse = activeScriptType === 'auto' ? productInfo?.script : manualScript;
    if (!scriptToUse) return;
    
    setIsGeneratingAudio(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: scriptToUse }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceGender === 'female' ? 'Kore' : 'Puck' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, 36 + bytes.length, true);
        view.setUint32(8, 0x57415645, false);
        view.setUint32(12, 0x666d7420, false);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 24000 * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, bytes.length, true);

        const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
        setAudioUrl(URL.createObjectURL(blob));
      }
    } catch (err: any) {
      console.error(err);
      setError("Erro ao gerar a narração.");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const startRecording = async () => {
    if (!canvasRef.current || !audioUrl || !mediaSource || !productInfo) return;

    setIsRecording(true);
    setRecordingProgress(0);
    setVideoBlobUrl(null);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    // Setup Audio
    const audio = new Audio(audioUrl);
    audio.crossOrigin = "anonymous";
    try {
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = resolve;
        audio.onerror = () => reject(new Error("Erro ao carregar áudio da narração."));
        // Timeout after 5s
        setTimeout(() => reject(new Error("Tempo esgotado ao carregar áudio.")), 5000);
      });
    } catch (err: any) {
      setError(err.message);
      setIsRecording(false);
      return;
    }

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    
    // Voice Source
    const voiceSource = audioCtx.createMediaElementSource(audio);
    voiceSource.connect(dest);
    voiceSource.connect(audioCtx.destination);

    // Background Music Source
    let bgm: HTMLAudioElement | null = null;
    if (useBackgroundMusic) {
      bgm = new Audio(BGM_URL);
      bgm.crossOrigin = "anonymous";
      bgm.volume = 0.15; // Low volume for BGM
      bgm.loop = true;
      try {
        const bgmSource = audioCtx.createMediaElementSource(bgm);
        bgmSource.connect(dest);
        bgmSource.connect(audioCtx.destination);
      } catch (e) {
        console.warn("Could not load background music due to CORS, continuing without it.");
        bgm = null;
      }
    }

    // Setup MediaRecorder
    const canvasStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    const getSupportedMimeType = () => {
      const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
      for (const type of types) if (MediaRecorder.isTypeSupported(type)) return type;
      return '';
    };

    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(combinedStream, { mimeType });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      setVideoBlobUrl(URL.createObjectURL(blob));
      setIsRecording(false);
      audioCtx.close();
    };

    // Load Assets
    let asset: HTMLImageElement | HTMLVideoElement;
    if (mediaSource.type === 'image') {
      asset = new Image();
      asset.src = mediaSource.url;
      await new Promise(resolve => (asset as HTMLImageElement).onload = resolve);
    } else {
      asset = document.createElement('video');
      asset.src = mediaSource.url;
      asset.muted = true;
      asset.loop = true;
      asset.crossOrigin = "anonymous";
      await new Promise(resolve => (asset as HTMLVideoElement).onloadedmetadata = resolve);
      asset.play();
    }

    let startTime = 0;
    // Ensure we wait for audio duration and add a small buffer
    const audioDuration = audio.duration;
    const duration = (audioDuration && !isNaN(audioDuration) ? audioDuration : 10) * 1000 + 1500; // 1.5s buffer

    const draw = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setRecordingProgress(progress * 100);

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let x = 0, y = 0, s = 1.1;
      const animType = productInfo.animationType || 'panning';
      if (animType === 'panning') x = Math.sin(progress * Math.PI) * 50;
      else if (animType === 'bouncing') y = Math.sin(progress * Math.PI * 4) * 30;
      else if (animType === 'vibrating') { x = (Math.random() - 0.5) * 10; y = (Math.random() - 0.5) * 10; }
      else if (animType === 'sliding') x = -100 + progress * 200;

      const aspect = asset instanceof HTMLImageElement ? asset.height / asset.width : (asset as HTMLVideoElement).videoHeight / (asset as HTMLVideoElement).videoWidth;
      const drawW = canvas.width * s;
      const drawH = drawW * aspect;
      ctx.drawImage(asset, (canvas.width - drawW) / 2 + x, (canvas.height - drawH) / 2 + y, drawW, drawH);

      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, 'rgba(0,0,0,0.5)');
      grad.addColorStop(0.2, 'transparent');
      grad.addColorStop(0.8, 'transparent');
      grad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const currentHeadline = activeScriptType === 'auto' ? productInfo.headline : manualHeadline;
      ctx.fillStyle = SHOPEE_ORANGE;
      ctx.font = "bold 54px Inter, sans-serif";
      ctx.textAlign = "center";
      const tw = ctx.measureText(currentHeadline).width;
      ctx.fillRect((canvas.width - tw - 60) / 2, 100, tw + 60, 80);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(currentHeadline, canvas.width / 2, 160);

      ctx.font = "bold 36px Inter, sans-serif";
      ctx.fillText(productInfo.name, canvas.width / 2, canvas.height - 120);
      ctx.font = "28px Inter, sans-serif";
      ctx.fillText("Link na Bio 🔗", canvas.width / 2, canvas.height - 70);

      if (progress < 1) {
        requestRef.current = requestAnimationFrame(draw);
      } else {
        recorder.stop();
        audio.pause();
        if (bgm) bgm.pause();
        if (asset instanceof HTMLVideoElement) asset.pause();
      }
    };

    recorder.start();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    audio.play();
    if (bgm) bgm.play();
    requestRef.current = requestAnimationFrame(draw);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-orange-100">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#EE4D2D] rounded-lg flex items-center justify-center text-white">
              <ShoppingBag size={20} />
            </div>
            <h1 className="font-bold text-xl tracking-tight">Shopee Story Maker</h1>
          </div>
          <div className="text-xs font-mono text-gray-400 uppercase tracking-widest">Creator Mode</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left: Upload & Info */}
          <div className="lg:col-span-5 space-y-8">
            <section className="space-y-4">
              <h2 className="text-4xl font-bold tracking-tight">Crie seu <span className="text-[#EE4D2D]">Achadinho</span></h2>
              <p className="text-gray-500 leading-relaxed">
                Transforme fotos em vídeos virais para Stories. Começa com "Olha o que achei na Shopee" e narra os benefícios automaticamente.
              </p>
            </section>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative aspect-[9/12] rounded-3xl border-2 border-dashed transition-all cursor-pointer overflow-hidden flex flex-col items-center justify-center gap-4 group bg-white shadow-sm",
                mediaSource ? "border-[#EE4D2D]/50" : "border-black/10 hover:border-[#EE4D2D]/50"
              )}
            >
              <input type="file" ref={fileInputRef} onChange={handleMediaUpload} accept="image/*,video/*" className="hidden" />
              {mediaSource ? (
                <>
                  {mediaSource.type === 'image' ? (
                    <img src={mediaSource.url} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <video src={mediaSource.url} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay />
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <RefreshCw className="text-white" size={32} />
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center text-[#EE4D2D]">
                    <Upload size={24} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Enviar Foto ou Vídeo</p>
                    <p className="text-xs text-gray-400">Arraste o produto aqui</p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">O que é o produto? (Opcional)</label>
              <textarea 
                value={userProductDescription}
                onChange={(e) => setUserProductDescription(e.target.value)}
                placeholder="Ex: Robô aspirador inteligente com sensor de queda..."
                className="w-full p-4 rounded-2xl border border-black/10 bg-white focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D] outline-none transition-all resize-none h-24 text-sm"
              />
              <p className="text-[10px] text-gray-400 italic">Dica: Descrever o produto ajuda a IA a criar um roteiro mais preciso.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Voz da Narração</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setVoiceGender('female')}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-semibold transition-all border",
                    voiceGender === 'female' 
                      ? "bg-orange-50 border-[#EE4D2D] text-[#EE4D2D]" 
                      : "bg-white border-black/10 text-gray-500 hover:border-black/20"
                  )}
                >
                  Feminina
                </button>
                <button
                  onClick={() => setVoiceGender('male')}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-semibold transition-all border",
                    voiceGender === 'male' 
                      ? "bg-orange-50 border-[#EE4D2D] text-[#EE4D2D]" 
                      : "bg-white border-black/10 text-gray-500 hover:border-black/20"
                  )}
                >
                  Masculina
                </button>
              </div>
            </div>

            <button
              onClick={analyzeProduct}
              disabled={!mediaSource || isAnalyzing}
              className={cn(
                "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                !mediaSource || isAnalyzing 
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed" 
                  : "bg-[#EE4D2D] text-white hover:bg-[#D73211] active:scale-[0.98] shadow-orange-500/20"
              )}
            >
              {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
              {isAnalyzing ? "Analisando Produto..." : "Gerar Roteiro Viral"}
            </button>

            {error && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-start gap-3">
                <AlertCircle className="shrink-0 mt-0.5" size={18} />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </div>

          {/* Right: Preview & Video Generation */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {!productInfo && !isAnalyzing && (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="h-full min-h-[500px] border border-black/5 rounded-3xl bg-white/50 flex flex-col items-center justify-center text-gray-400 p-12 text-center"
                >
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
                    <Video size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-600 mb-2">Editor de Vídeo</h3>
                  <p className="max-w-xs">A análise criará o roteiro e preparará o estúdio de gravação.</p>
                </motion.div>
              )}

              {productInfo && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  {/* Video Studio Card */}
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-2xl font-bold tracking-tight">{productInfo.name}</h3>
                        <p className="text-gray-500 text-sm">Pronto para gravação</p>
                      </div>
                      <div className="flex gap-2">
                        {!audioUrl ? (
                          <button 
                            onClick={generateAudio}
                            disabled={isGeneratingAudio}
                            className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-rose-100 transition-colors"
                          >
                            {isGeneratingAudio ? <Loader2 className="animate-spin" size={14} /> : <Volume2 size={14} />}
                            Gerar Voz
                          </button>
                        ) : (
                          <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold flex items-center gap-2">
                            <CheckCircle2 size={14} />
                            Voz Pronta
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Canvas Preview (Hidden/Small) */}
                      <div className="space-y-4">
                        <div className="relative aspect-[9/16] w-full max-w-[240px] mx-auto bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-white">
                          <canvas 
                            ref={canvasRef} 
                            width={1080} 
                            height={1920} 
                            className="w-full h-full object-contain"
                          />
                          {isRecording && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-4 text-center">
                              <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white animate-spin mb-4" />
                              <p className="text-xs font-bold uppercase tracking-widest">Gravando Story...</p>
                              <p className="text-[10px] mt-1 opacity-60">{Math.round(recordingProgress)}%</p>
                            </div>
                          )}
                        </div>
                        
                        <button
                          onClick={startRecording}
                          disabled={!audioUrl || isRecording}
                          className={cn(
                            "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all",
                            !audioUrl || isRecording
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-black text-white hover:bg-gray-800"
                          )}
                        >
                          <Video size={20} />
                          {isRecording ? "Gravando..." : "Gravar Vídeo Story"}
                        </button>
                      </div>

                      {/* Video Result */}
                      <div className="space-y-4">
                        <div className="aspect-[9/16] w-full max-w-[240px] mx-auto bg-gray-50 rounded-2xl border-2 border-dashed border-black/5 flex flex-col items-center justify-center text-center p-6">
                          {videoBlobUrl ? (
                            <div className="relative w-full h-full">
                              <video src={videoBlobUrl} controls className="w-full h-full rounded-xl object-cover shadow-lg" />
                              <a 
                                href={videoBlobUrl} 
                                download={`shopee-achadinho-${Date.now()}.webm`}
                                className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-full font-bold shadow-xl flex items-center gap-2 hover:bg-emerald-600 transition-all active:scale-95 whitespace-nowrap"
                              >
                                <Download size={18} />
                                Baixar Vídeo
                              </a>
                            </div>
                          ) : (
                            <>
                              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-300">
                                <Download size={24} />
                              </div>
                              <p className="text-xs font-medium text-gray-400">O vídeo final aparecerá aqui após a gravação.</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customization Card */}
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-[#EE4D2D] flex items-center gap-2">
                        <Sparkles size={18} />
                        Escolher Roteiro
                      </h3>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Música</label>
                        <button 
                          onClick={() => setUseBackgroundMusic(!useBackgroundMusic)}
                          className={cn(
                            "w-10 h-5 rounded-full transition-all relative",
                            useBackgroundMusic ? "bg-[#EE4D2D]" : "bg-gray-300"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                            useBackgroundMusic ? "right-1" : "left-1"
                          )} />
                        </button>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                      <button 
                        onClick={() => setActiveScriptType('auto')}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                          activeScriptType === 'auto' ? "bg-white text-[#EE4D2D] shadow-sm" : "text-gray-500"
                        )}
                      >
                        Automático (IA)
                      </button>
                      <button 
                        onClick={() => setActiveScriptType('manual')}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                          activeScriptType === 'manual' ? "bg-white text-[#EE4D2D] shadow-sm" : "text-gray-500"
                        )}
                      >
                        Manual (Você)
                      </button>
                    </div>

                    <div className="space-y-4">
                      {activeScriptType === 'auto' ? (
                        <>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Título Automático</label>
                            <input 
                              type="text"
                              value={productInfo.headline}
                              onChange={(e) => setProductInfo({...productInfo, headline: e.target.value})}
                              className="w-full p-3 rounded-xl border border-black/5 bg-gray-50 text-sm font-bold focus:border-[#EE4D2D] outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Narração Automática</label>
                            <textarea 
                              value={productInfo.script}
                              onChange={(e) => setProductInfo({...productInfo, script: e.target.value})}
                              className="w-full p-3 rounded-xl border border-black/5 bg-gray-50 text-sm focus:border-[#EE4D2D] outline-none resize-none h-24"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Seu Título</label>
                            <input 
                              type="text"
                              value={manualHeadline}
                              onChange={(e) => setManualHeadline(e.target.value)}
                              placeholder="Ex: Olha o que comprei!"
                              className="w-full p-3 rounded-xl border border-black/5 bg-gray-50 text-sm font-bold focus:border-[#EE4D2D] outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Sua Narração</label>
                            <textarea 
                              value={manualScript}
                              onChange={(e) => setManualScript(e.target.value)}
                              placeholder="Escreva aqui o que você quer que a voz diga..."
                              className="w-full p-3 rounded-xl border border-black/5 bg-gray-50 text-sm focus:border-[#EE4D2D] outline-none resize-none h-24"
                            />
                          </div>
                        </>
                      )}
                      
                      <button
                        onClick={generateAudio}
                        disabled={isGeneratingAudio || (activeScriptType === 'manual' && !manualScript)}
                        className="w-full py-3 rounded-xl bg-orange-50 text-[#EE4D2D] font-bold text-sm hover:bg-orange-100 transition-all flex items-center justify-center gap-2"
                      >
                        {isGeneratingAudio ? <Loader2 className="animate-spin" size={16} /> : <Volume2 size={16} />}
                        {audioUrl ? "Atualizar Voz" : "Gerar Voz"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-black/5 mt-12 text-center text-gray-400 text-sm">
        <p>© 2026 Shopee Story Maker • Gere vídeos profissionais em segundos</p>
      </footer>
    </div>
  );
}
