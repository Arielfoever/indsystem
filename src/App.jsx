import { useEffect, useMemo, useRef, useState } from 'react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Slider,
  Stack,
  Toolbar,
  Typography
} from '@mui/material'
import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded'
import PhotoRoundedIcon from '@mui/icons-material/PhotoRounded'
import MovieRoundedIcon from '@mui/icons-material/MovieRounded'
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded'
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded'
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import { getMessages } from './i18n'
import { MODEL_CACHE_NAME, ONLINE_MODELS } from './onlineModels'

const drawerWidth = 320
const METRICS_UPDATE_GAP_MS = 120

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: '#1f3a5f' },
    secondary: { main: '#2c6d72' },
    background: { default: '#eef2f7', paper: '#f8fbff' }
  },
  shape: { borderRadius: 18 },
  typography: {
    fontFamily: '"Noto Sans SC Variable", "Noto Sans SC", sans-serif',
    h5: { fontWeight: 700 }
  }
})

const makeStatus = (level, text) => ({ level, text })

function App() {
  const [lang, setLang] = useState(() => {
    const saved = window.localStorage.getItem('lang')
    if (saved === 'zh' || saved === 'en') return saved
    const systemLang = (window.navigator.language || '').toLowerCase()
    return systemLang.startsWith('zh') ? 'zh' : 'en'
  })
  const isMobile = useMediaQuery('(max-width:900px)')
  const appBarHeight = isMobile ? 56 : 64
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState('image')
  const [provider, setProvider] = useState('wasm')
  const [modelSource, setModelSource] = useState('online')
  const [onlineModels, setOnlineModels] = useState(ONLINE_MODELS)
  const [selectedOnlineModel, setSelectedOnlineModel] = useState(ONLINE_MODELS[0].id)
  const [refreshingModelList, setRefreshingModelList] = useState(false)
  const [lastModelListRefreshAt, setLastModelListRefreshAt] = useState(null)
  const [modelListRefreshErrorDetail, setModelListRefreshErrorDetail] = useState('')
  const [copiedErrorDetail, setCopiedErrorDetail] = useState(false)
  const [cameraDevices, setCameraDevices] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [cameraMirror, setCameraMirror] = useState(true)
  const [modelName, setModelName] = useState('')
  const [modelInputSize, setModelInputSize] = useState(256)
  const [status, setStatus] = useState(makeStatus('info', ''))
  const [running, setRunning] = useState(false)
  const [maxFps, setMaxFps] = useState(8)
  const [fpsMode, setFpsMode] = useState('manual')
  const [autoMaxFps, setAutoMaxFps] = useState(8)
  const [currentFps, setCurrentFps] = useState(0)
  const [processMs, setProcessMs] = useState(0)
  const [imageSizeText, setImageSizeText] = useState('-')
  const [videoInfoText, setVideoInfoText] = useState('-')
  const [imageDownloadFormat, setImageDownloadFormat] = useState('png')
  const [videoDownloadFormat, setVideoDownloadFormat] = useState('mp4')
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 420 })
  const [sourceDownscale, setSourceDownscale] = useState(100)
  const [inferenceScale, setInferenceScale] = useState(100)
  const [renderPath, setRenderPath] = useState('putImageData')
  const [mobileInputOpen, setMobileInputOpen] = useState(true)
  const [mobileOutputOpen, setMobileOutputOpen] = useState(true)
  const [activeFullscreen, setActiveFullscreen] = useState('')

  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const modelInputRef = useRef(null)
  const inputCanvasRef = useRef(null)
  const outputCanvasRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const fileVideoRef = useRef(null)
  const inputPanelRef = useRef(null)
  const outputPanelRef = useRef(null)
  const rafRef = useRef(0)
  const streamRef = useRef(null)
  const sessionRef = useRef(null)
  const modelInputNameRef = useRef('')
  const modelOutputNameRef = useRef('')
  const imageElementRef = useRef(null)
  const imageObjectUrlRef = useRef('')
  const videoObjectUrlRef = useRef('')
  const processingRef = useRef(false)
  const lastInferAtRef = useRef(0)
  const fpsTimesRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordedVideoUrlRef = useRef('')
  const recordedVideoExtRef = useRef('webm')
  const recordedVideoMimeRef = useRef('video/webm')
  const preprocessCanvasRef = useRef(null)
  const preprocessCtxRef = useRef(null)
  const preprocessBufferRef = useRef(null)
  const preprocessBufferSizeRef = useRef(0)
  const frameCanvasRef = useRef(null)
  const frameCtxRef = useRef(null)
  const frameImageDataRef = useRef(null)
  const frameImageDataKeyRef = useRef('')
  const sourceScaleCanvasRef = useRef(null)
  const sourceScaleCtxRef = useRef(null)
  const offscreenCanvasRef = useRef(null)
  const offscreenCtxRef = useRef(null)
  const lastMetricsUpdateAtRef = useRef(0)
  const pendingFpsRef = useRef(0)
  const pendingProcessMsRef = useRef(0)
  const autoFpsEstimateRef = useRef(8)
  const lastAutoFpsUpdateAtRef = useRef(0)
  const ortModuleRef = useRef({ target: '', mod: null })
  const onlineModelAbortRef = useRef(null)
  const fixedInputSizeRef = useRef(null)
  const renderFallbackWarnedRef = useRef(false)
  const modelBufferCacheRef = useRef(new Map())
  const localModelBufferCacheRef = useRef(new Map())
  const modelCacheHandleRef = useRef(null)

  const providerOptions = useMemo(() => ['webgpu', 'webgl', 'wasm'], [])
  const t = useMemo(() => getMessages(lang), [lang])
  const modelListRefreshTimeText = useMemo(() => {
    if (!lastModelListRefreshAt) return t.ui.notRefreshedYet
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(lastModelListRefreshAt)
  }, [lastModelListRefreshAt, lang, t])
  const effectiveInferenceSize = useMemo(() => {
    const scaled = Math.round((modelInputSize * inferenceScale) / 100)
    const snapped = Math.round(scaled / 8) * 8
    return Math.max(64, Math.min(modelInputSize, snapped))
  }, [inferenceScale, modelInputSize])
  const effectiveMaxFps = fpsMode === 'auto' ? autoMaxFps : maxFps
  const canUseBitmapPath = useMemo(() => {
    if (typeof window === 'undefined') return false
    return typeof window.OffscreenCanvas !== 'undefined' && typeof window.createImageBitmap === 'function'
  }, [])
  const envStatus = useMemo(() => {
    const secure = typeof window !== 'undefined' ? window.isSecureContext : false
    const camera = typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    const cache = typeof window !== 'undefined' && 'caches' in window
    const crypto = typeof window !== 'undefined' && !!(window.crypto && window.crypto.subtle)
    return { secure, camera, cache, crypto }
  }, [])

  const loadOrtModule = async () => {
    const target = provider === 'wasm' ? 'wasm' : 'default'
    if (!ortModuleRef.current.mod || ortModuleRef.current.target !== target) {
      const mod = provider === 'wasm' ? await import('onnxruntime-web/wasm') : await import('onnxruntime-web')
      mod.env.wasm.numThreads = 1
      mod.env.wasm.proxy = false
      ortModuleRef.current = { target, mod }
    }
    return ortModuleRef.current.mod
  }

  const getModelCacheHandle = async () => {
    if (typeof window === 'undefined' || !('caches' in window)) return null
    if (!modelCacheHandleRef.current) {
      modelCacheHandleRef.current = await window.caches.open(MODEL_CACHE_NAME)
    }
    return modelCacheHandleRef.current
  }

  const fetchOnlineModelBuffer = async (model, signal) => {
    const inMemory = modelBufferCacheRef.current.get(model.id)
    if (inMemory?.buffer) {
      return inMemory.buffer
    }

    const cacheHandle = await getModelCacheHandle()
    const hasCacheApi = !!cacheHandle
    let response = null
    if (hasCacheApi) {
      response = await cacheHandle.match(model.url)
      if (!response) {
        const fetched = await fetch(model.url, { signal })
        if (!fetched.ok) throw new Error(`${fetched.status} ${fetched.statusText}`)
        await cacheHandle.put(model.url, fetched.clone())
        response = fetched
      }
    } else {
      const fetched = await fetch(model.url, { signal })
      if (!fetched.ok) throw new Error(`${fetched.status} ${fetched.statusText}`)
      response = fetched
    }

    const buffer = await response.arrayBuffer()
    const valid = await verifySha256(buffer, model.sha256)
    if (valid === false) {
      if (hasCacheApi) {
        await cacheHandle.delete(model.url)
      }
      throw new Error(t.status.hashMismatch)
    }

    modelBufferCacheRef.current.set(model.id, {
      buffer,
      verified: valid !== false
    })

    return buffer
  }

  const createSessionFromBuffer = async (buffer, displayName) => {
    const ort = await loadOrtModule()
    const session = await ort.InferenceSession.create(buffer, {
      executionProviders: [provider]
    })
    sessionRef.current = session
    modelInputNameRef.current = session.inputNames[0]
    modelOutputNameRef.current = session.outputNames[0]
    const dims = session.inputMetadata[modelInputNameRef.current]?.dimensions || []
    const inferred = Number(dims[2])
    if (Number.isFinite(inferred) && inferred > 0) setModelInputSize(inferred)
    fixedInputSizeRef.current = null
    setModelName(displayName)
  }

  const toHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')

  const verifySha256 = async (arrayBuffer, expectedSha256) => {
    const hasSubtleCrypto = typeof window !== 'undefined' && window.crypto && window.crypto.subtle
    if (!hasSubtleCrypto) return null
    const digest = await window.crypto.subtle.digest('SHA-256', arrayBuffer)
    const actual = toHex(new Uint8Array(digest))
    return actual === expectedSha256.toLowerCase()
  }

  useEffect(() => {
    if (!sessionRef.current) {
      setStatus(makeStatus('info', t.status.loadOnnxFirst))
      setModelName(t.ui.modelNotLoaded)
    }
  }, [t])

  useEffect(() => {
    window.localStorage.setItem('lang', lang)
  }, [lang])

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.documentElement.setAttribute('translate', 'no')
    document.body.setAttribute('translate', 'no')
    document.title = t.ui.appTitle
  }, [lang, t])

  const drawImageCover = (ctx, image, targetWidth, targetHeight) => {
    const scale = Math.min(targetWidth / image.width, targetHeight / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    const x = (targetWidth - drawWidth) * 0.5
    const y = (targetHeight - drawHeight) * 0.5
    ctx.clearRect(0, 0, targetWidth, targetHeight)
    ctx.drawImage(image, x, y, drawWidth, drawHeight)
  }

  const syncCanvasSize = (width, height) => {
    const w = Math.max(1, Math.round(width || 0))
    const h = Math.max(1, Math.round(height || 0))
    if (!w || !h) return
    setCanvasSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
  }

  const preprocessToTensor = (sourceEl, size, ort) => {
    if (!preprocessCanvasRef.current) {
      preprocessCanvasRef.current = document.createElement('canvas')
    }
    const prep = preprocessCanvasRef.current
    if (prep.width !== size) prep.width = size
    if (prep.height !== size) prep.height = size
    if (!preprocessCtxRef.current) {
      preprocessCtxRef.current = prep.getContext('2d', { willReadFrequently: true })
    }
    const prepCtx = preprocessCtxRef.current
    if (!prepCtx) throw new Error('2D context unavailable for preprocessing')

    const sourceWidth = sourceEl.videoWidth || sourceEl.naturalWidth || sourceEl.width || size
    const sourceHeight = sourceEl.videoHeight || sourceEl.naturalHeight || sourceEl.height || size
    const scaleRatio = Math.max(0.1, Math.min(1, sourceDownscale / 100))
    const scaledWidth = Math.max(1, Math.round(sourceWidth * scaleRatio))
    const scaledHeight = Math.max(1, Math.round(sourceHeight * scaleRatio))

    if (scaleRatio < 0.999) {
      if (!sourceScaleCanvasRef.current) {
        sourceScaleCanvasRef.current = document.createElement('canvas')
      }
      const sourceScaleCanvas = sourceScaleCanvasRef.current
      if (sourceScaleCanvas.width !== scaledWidth) sourceScaleCanvas.width = scaledWidth
      if (sourceScaleCanvas.height !== scaledHeight) sourceScaleCanvas.height = scaledHeight
      if (!sourceScaleCtxRef.current) {
        sourceScaleCtxRef.current = sourceScaleCanvas.getContext('2d', { willReadFrequently: true })
      }
      const sourceScaleCtx = sourceScaleCtxRef.current
      if (!sourceScaleCtx) throw new Error('2D context unavailable for source downscale')
      sourceScaleCtx.imageSmoothingEnabled = true
      sourceScaleCtx.imageSmoothingQuality = 'low'
      sourceScaleCtx.drawImage(sourceEl, 0, 0, scaledWidth, scaledHeight)
      prepCtx.imageSmoothingEnabled = true
      prepCtx.imageSmoothingQuality = 'low'
      prepCtx.drawImage(sourceScaleCanvas, 0, 0, size, size)
    } else {
      prepCtx.drawImage(sourceEl, 0, 0, size, size)
    }

    const imgData = prepCtx.getImageData(0, 0, size, size).data
    const bufferLength = 3 * size * size
    if (!preprocessBufferRef.current || preprocessBufferSizeRef.current !== bufferLength) {
      preprocessBufferRef.current = new Float32Array(bufferLength)
      preprocessBufferSizeRef.current = bufferLength
    }
    const floatData = preprocessBufferRef.current
    const plane = size * size
    for (let i = 0; i < plane; i += 1) {
      floatData[i] = imgData[i * 4] / 255
      floatData[i + plane] = imgData[i * 4 + 1] / 255
      floatData[i + 2 * plane] = imgData[i * 4 + 2] / 255
    }
    return new ort.Tensor('float32', floatData, [1, 3, size, size])
  }

  const drawTensorToCanvas = async (tensor, canvas, mirror = false) => {
    const h = tensor.dims[2]
    const w = tensor.dims[3]
    const plane = w * h
    const useBitmapPath = renderPath === 'imageBitmap' && canUseBitmapPath
    let frameCtx
    let frame
    if (useBitmapPath) {
      if (!offscreenCanvasRef.current || offscreenCanvasRef.current.width !== w || offscreenCanvasRef.current.height !== h) {
        offscreenCanvasRef.current = new window.OffscreenCanvas(w, h)
        offscreenCtxRef.current = offscreenCanvasRef.current.getContext('2d')
      }
      frame = offscreenCanvasRef.current
      frameCtx = offscreenCtxRef.current
    } else {
      if (renderPath === 'imageBitmap' && !canUseBitmapPath && !renderFallbackWarnedRef.current) {
        renderFallbackWarnedRef.current = true
        setStatus(makeStatus('warning', t.status.imageBitmapUnsupported))
      }
      if (!frameCanvasRef.current) frameCanvasRef.current = document.createElement('canvas')
      frame = frameCanvasRef.current
      if (frame.width !== w) frame.width = w
      if (frame.height !== h) frame.height = h
      if (!frameCtxRef.current) frameCtxRef.current = frame.getContext('2d')
      frameCtx = frameCtxRef.current
    }
    if (!frameCtx || !frame) throw new Error('2D context unavailable for rendering')
    const imageDataKey = `${w}x${h}`
    if (!frameImageDataRef.current || frameImageDataKeyRef.current !== imageDataKey) {
      frameImageDataRef.current = frameCtx.createImageData(w, h)
      frameImageDataKeyRef.current = imageDataKey
    }
    const imageData = frameImageDataRef.current
    const data = tensor.data
    const rgba = imageData.data
    for (let i = 0; i < plane; i += 1) {
      const p = i * 4
      let r = (data[i] * 255 + 0.5) | 0
      let g = (data[i + plane] * 255 + 0.5) | 0
      let b = (data[i + 2 * plane] * 255 + 0.5) | 0
      if (r < 0) r = 0
      else if (r > 255) r = 255
      if (g < 0) g = 0
      else if (g > 255) g = 255
      if (b < 0) b = 0
      else if (b > 255) b = 255
      rgba[p] = r
      rgba[p + 1] = g
      rgba[p + 2] = b
      rgba[p + 3] = 255
    }
    frameCtx.putImageData(imageData, 0, 0)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable for output canvas')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (useBitmapPath) {
      const bitmap = await window.createImageBitmap(frame)
      if (mirror) {
        ctx.save()
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, canvas.width, canvas.height)
        ctx.restore()
      } else {
        ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, canvas.width, canvas.height)
      }
      if (typeof bitmap.close === 'function') bitmap.close()
      return
    }
    if (mirror) {
      ctx.save()
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(frame, 0, 0, frame.width, frame.height, 0, 0, canvas.width, canvas.height)
      ctx.restore()
    } else {
      ctx.drawImage(frame, 0, 0, frame.width, frame.height, 0, 0, canvas.width, canvas.height)
    }
  }

  const runEnhanceOnElement = async (sourceEl, outputCanvas, mirror = false) => {
    if (!sessionRef.current) {
      setStatus(makeStatus('warning', t.status.loadModelFirst))
      return
    }
    const ort = await loadOrtModule()
    const t0 = performance.now()
    let tensorSize = fixedInputSizeRef.current || effectiveInferenceSize
    let inputTensor = preprocessToTensor(sourceEl, tensorSize, ort)
    let feed = { [modelInputNameRef.current]: inputTensor }
    let result
    try {
      result = await sessionRef.current.run(feed)
    } catch (error) {
      if (tensorSize !== modelInputSize) {
        tensorSize = modelInputSize
        inputTensor = preprocessToTensor(sourceEl, tensorSize, ort)
        feed = { [modelInputNameRef.current]: inputTensor }
        result = await sessionRef.current.run(feed)
        if (!fixedInputSizeRef.current) {
          fixedInputSizeRef.current = modelInputSize
          setStatus(makeStatus('warning', t.status.modelFixedInputFallback))
        }
      } else {
        throw error
      }
    }
    await drawTensorToCanvas(result[modelOutputNameRef.current], outputCanvas, mirror)
    return Math.round(performance.now() - t0)
  }

  const flushRealtimeMetrics = (now, fps, latencyMs, force = false) => {
    pendingFpsRef.current = fps
    pendingProcessMsRef.current = latencyMs
    if (!force && now - lastMetricsUpdateAtRef.current < METRICS_UPDATE_GAP_MS) return
    lastMetricsUpdateAtRef.current = now
    setCurrentFps(pendingFpsRef.current)
    setProcessMs(pendingProcessMsRef.current)
  }

  const updateAutoMaxFps = (processTimeMs) => {
    if (fpsMode !== 'auto' || !Number.isFinite(processTimeMs) || processTimeMs <= 0) return
    const raw = Math.floor(1000 / Math.max(1, processTimeMs * 1.15))
    const capped = Math.max(1, Math.min(120, raw))
    const smoothed = autoFpsEstimateRef.current * 0.75 + capped * 0.25
    autoFpsEstimateRef.current = smoothed
    const rounded = Math.max(1, Math.min(120, Math.round(smoothed)))
    const now = performance.now()
    if (rounded !== autoMaxFps && now - lastAutoFpsUpdateAtRef.current > 700) {
      lastAutoFpsUpdateAtRef.current = now
      setAutoMaxFps(rounded)
    }
  }

  const cleanupCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setRunning(false)
    setCurrentFps(0)
    setProcessMs(0)
    lastMetricsUpdateAtRef.current = 0
    pendingFpsRef.current = 0
    pendingProcessMsRef.current = 0
    fpsTimesRef.current = []
    processingRef.current = false
  }

  const startOutputRecording = () => {
    const canvas = outputCanvasRef.current
    if (!canvas || mediaRecorderRef.current || typeof MediaRecorder === 'undefined') return
    if (recordedVideoUrlRef.current) {
      URL.revokeObjectURL(recordedVideoUrlRef.current)
      recordedVideoUrlRef.current = ''
    }
    recordedChunksRef.current = []
    const stream = canvas.captureStream(Math.max(1, effectiveMaxFps))
    const preferred = videoDownloadFormat === 'mp4'
      ? [
          { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
          { mime: 'video/mp4', ext: 'mp4' },
          { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
          { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
          { mime: 'video/webm', ext: 'webm' }
        ]
      : [
          { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
          { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
          { mime: 'video/webm', ext: 'webm' },
          { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
          { mime: 'video/mp4', ext: 'mp4' }
        ]
    const selected = preferred.find((item) => MediaRecorder.isTypeSupported(item.mime)) || preferred[preferred.length - 1]
    recordedVideoExtRef.current = selected.ext
    recordedVideoMimeRef.current = selected.mime
    const recorder = new MediaRecorder(stream, { mimeType: selected.mime })
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      if (recordedChunksRef.current.length === 0) return
      const blob = new Blob(recordedChunksRef.current, { type: recordedVideoMimeRef.current })
      recordedVideoUrlRef.current = URL.createObjectURL(blob)
    }
    recorder.start()
    mediaRecorderRef.current = recorder
  }

  const stopOutputRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
  }

  const startLoop = () => {
    const video = sourceMode === 'camera' ? cameraVideoRef.current : fileVideoRef.current
    const output = outputCanvasRef.current
    if (!video || !output) return

    const frame = async (now) => {
      if (!running) return
      if (sourceMode === 'video' && video.ended) {
        stopOutputRecording()
        setRunning(false)
        setStatus(makeStatus('info', t.status.videoEnded))
        return
      }
      const targetGap = 1000 / Math.max(1, effectiveMaxFps)
      if (
        !processingRef.current &&
        now - lastInferAtRef.current >= targetGap &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        processingRef.current = true
        try {
          lastInferAtRef.current = now
          const processTime = await runEnhanceOnElement(video, output, sourceMode === 'camera' ? cameraMirror : false)
          updateAutoMaxFps(processTime)
          const times = fpsTimesRef.current
          times.push(now)
          while (times.length > 0 && now - times[0] > 1000) times.shift()
          flushRealtimeMetrics(now, times.length, processTime)
        } catch (error) {
          setStatus(makeStatus('error', t.status.realtimeFailed(error.message)))
        } finally {
          processingRef.current = false
        }
      }
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  const handleModelFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setStatus(makeStatus('info', t.status.loadingModel(file.name)))
      const cacheKey = `${file.name}:${file.size}:${file.lastModified}`
      const cachedBuffer = localModelBufferCacheRef.current.get(cacheKey)
      const buffer = cachedBuffer || (await Promise.all([file.arrayBuffer(), loadOrtModule()]).then(([buf]) => buf))
      if (!cachedBuffer) {
        localModelBufferCacheRef.current.set(cacheKey, buffer)
      }
      await createSessionFromBuffer(buffer, file.name)
      setStatus(makeStatus('success', t.status.modelLoaded(provider)))
    } catch (error) {
      sessionRef.current = null
      setStatus(makeStatus('error', t.status.modelLoadFailed(error.message)))
    } finally {
      event.target.value = ''
    }
  }

  const loadOnlineModel = async () => {
    const model = onlineModels.find((item) => item.id === selectedOnlineModel)
    if (!model) return
    if (onlineModelAbortRef.current) {
      onlineModelAbortRef.current.abort()
    }
    const controller = new AbortController()
    onlineModelAbortRef.current = controller
    try {
      setStatus(makeStatus('info', t.status.loadingOnlineModel(model.name)))
      const buffer = await fetchOnlineModelBuffer(model, controller.signal)
      await createSessionFromBuffer(buffer, model.name)

      const entry = modelBufferCacheRef.current.get(model.id)
      if (entry?.verified === false) {
        setStatus(makeStatus('warning', `${t.status.onlineModelCached(model.name)} (${t.status.integritySkipped})`))
      } else if (entry && typeof entry.verified === 'boolean' && !entry.verified) {
        setStatus(makeStatus('warning', `${t.status.onlineModelCached(model.name)} (${t.status.integritySkipped})`))
      } else {
        setStatus(makeStatus('success', t.status.onlineModelCached(model.name)))
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus(makeStatus('info', t.status.onlineModelLoadCancelled))
        return
      }
      sessionRef.current = null
      setStatus(makeStatus('error', t.status.onlineModelDownloadFailed(error.message)))
    } finally {
      if (onlineModelAbortRef.current === controller) {
        onlineModelAbortRef.current = null
      }
    }
  }

  const clearModelCache = async () => {
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        await window.caches.delete(MODEL_CACHE_NAME)
      }
      modelCacheHandleRef.current = null
      modelBufferCacheRef.current.clear()
      setStatus(makeStatus('success', t.status.modelCacheCleared))
    } catch (error) {
      setStatus(makeStatus('error', t.status.modelCacheClearFailed(error.message)))
    }
  }

  const refreshOnlineModelList = async (showStatus = true) => {
    if (refreshingModelList) return onlineModels
    setRefreshingModelList(true)
    setModelListRefreshErrorDetail('')
    setCopiedErrorDetail(false)
    try {
      if (showStatus) setStatus(makeStatus('info', t.status.refreshingModelList))
      const next = ONLINE_MODELS.filter(
        (item) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.url === 'string' && typeof item.sha256 === 'string'
      )
      if (!next.length) throw new Error('Model list is empty')
      setOnlineModels(next)
      setSelectedOnlineModel((prev) => (next.some((item) => item.id === prev) ? prev : next[0].id))
      setLastModelListRefreshAt(new Date())
      setModelListRefreshErrorDetail('')
      if (showStatus) setStatus(makeStatus('success', t.status.modelListRefreshed(next.length)))
      return next
    } catch (error) {
      const detail = error?.message || 'unknown error'
      setOnlineModels(ONLINE_MODELS)
      setSelectedOnlineModel((prev) => (ONLINE_MODELS.some((item) => item.id === prev) ? prev : ONLINE_MODELS[0].id))
      setModelListRefreshErrorDetail(detail)
      if (showStatus) setStatus(makeStatus('warning', t.status.modelListRefreshFallbackWithReason(detail)))
      return ONLINE_MODELS
    } finally {
      setRefreshingModelList(false)
    }
  }

  const copyModelListErrorDetail = async () => {
    if (!modelListRefreshErrorDetail) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(modelListRefreshErrorDetail)
      } else {
        const area = document.createElement('textarea')
        area.value = modelListRefreshErrorDetail
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }
      setCopiedErrorDetail(true)
      setStatus(makeStatus('success', t.status.errorDetailCopied))
    } catch (error) {
      setStatus(makeStatus('warning', t.status.errorDetailCopyFailed(error?.message || 'unknown error')))
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        await loadOrtModule()
        if (cancelled) return
        const model = ONLINE_MODELS.find((item) => item.id === selectedOnlineModel)
        if (!model) return
        await fetchOnlineModelBuffer(model)
      } catch {
        // Warmup is best effort.
      }
    }

    const timerId = window.setTimeout(run, 200)
    return () => {
      cancelled = true
      clearTimeout(timerId)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const model = ONLINE_MODELS.find((item) => item.id === selectedOnlineModel)
    if (!model || modelBufferCacheRef.current.has(model.id)) return () => {
      cancelled = true
    }

    const run = async () => {
      try {
        await fetchOnlineModelBuffer(model)
      } catch {
        // Silent prefetch best effort.
      }
    }

    const idleId =
      typeof window !== 'undefined' && window.requestIdleCallback
        ? window.requestIdleCallback(run, { timeout: 1500 })
        : window.setTimeout(run, 800)

    return () => {
      cancelled = true
      if (typeof window !== 'undefined' && window.cancelIdleCallback && typeof idleId === 'number') {
        window.cancelIdleCallback(idleId)
      } else {
        clearTimeout(idleId)
      }
    }
  }, [selectedOnlineModel])

  const handleImageFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current)
      imageObjectUrlRef.current = ''
    }
    const img = new Image()
    img.onload = () => {
      imageElementRef.current = img
      syncCanvasSize(img.width, img.height)
      const inputCanvas = inputCanvasRef.current
      const outputCanvas = outputCanvasRef.current
      if (!inputCanvas || !outputCanvas) return
      drawImageCover(inputCanvas.getContext('2d'), img, inputCanvas.width, inputCanvas.height)
      outputCanvas.getContext('2d').clearRect(0, 0, outputCanvas.width, outputCanvas.height)
      setImageSizeText(`${img.width} x ${img.height}`)
      setStatus(makeStatus('success', t.status.imageLoaded))
    }
    img.onerror = () => setStatus(makeStatus('error', t.status.imageLoadFailed))
    const url = URL.createObjectURL(file)
    imageObjectUrlRef.current = url
    img.src = url
    event.target.value = ''
  }

  const handleVideoFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    stopCamera()
    const video = fileVideoRef.current
    if (!video) return
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current)
      videoObjectUrlRef.current = ''
    }
    const url = URL.createObjectURL(file)
    videoObjectUrlRef.current = url
    video.src = url
    video.load()
    video.onloadedmetadata = () => {
      syncCanvasSize(video.videoWidth, video.videoHeight)
      setVideoInfoText(`${video.videoWidth} x ${video.videoHeight} | ${Math.round(video.duration || 0)}s`)
      setStatus(makeStatus('success', t.status.videoLoaded))
    }
    video.onerror = () => setStatus(makeStatus('error', t.status.videoLoadFailed))
    event.target.value = ''
  }

  const runImageEnhance = async () => {
    const img = imageElementRef.current
    const output = outputCanvasRef.current
    if (!img || !output) {
      setStatus(makeStatus('warning', t.status.chooseImageFirst))
      return
    }
    try {
      setStatus(makeStatus('info', t.status.imageInferring))
      const processTime = await runEnhanceOnElement(img, output)
      setProcessMs(processTime)
      setStatus(makeStatus('success', t.status.imageDone))
    } catch (error) {
      setStatus(makeStatus('error', t.status.imageInferFailed(error.message)))
    }
  }

  const startCamera = async () => {
    if (!sessionRef.current) {
      setStatus(makeStatus('warning', t.status.loadModelBeforeCamera))
      return
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(makeStatus('error', t.status.mediaDevicesUnavailable))
      return
    }
    try {
      cleanupCamera()
      const videoConstraints = selectedCameraId
        ? { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      })
      streamRef.current = stream
      const video = cameraVideoRef.current
      video.srcObject = stream
      await video.play()
      syncCanvasSize(video.videoWidth, video.videoHeight)
      setRunning(true)
      setStatus(makeStatus('success', t.status.cameraStarted(effectiveMaxFps)))
    } catch (error) {
      setStatus(makeStatus('error', t.status.cameraAccessFailed(error.message)))
      cleanupCamera()
    }
  }

  const stopCamera = () => {
    cleanupCamera()
    setStatus(makeStatus('info', t.status.cameraStopped))
  }

  const switchCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(makeStatus('error', t.status.mediaDevicesUnavailable))
      return
    }
    try {
      cleanupCamera()
      const videoConstraints = selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : true
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      })
      streamRef.current = stream
      const video = cameraVideoRef.current
      video.srcObject = stream
      await video.play()
      syncCanvasSize(video.videoWidth, video.videoHeight)
      setRunning(true)
      setStatus(makeStatus('success', t.status.cameraSwitched))
    } catch (error) {
      setStatus(makeStatus('error', t.status.cameraSwitchFailed(error.message)))
    }
  }

  const refreshCameraDevices = async (silent = false) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      if (!silent) setStatus(makeStatus('error', t.status.mediaDevicesUnavailable))
      return
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const videos = all.filter((d) => d.kind === 'videoinput')
      setCameraDevices(videos)
      if (!videos.length) {
        setSelectedCameraId('')
        if (!silent) setStatus(makeStatus('warning', t.status.noCameraFound))
        return
      }
      if (!videos.some((d) => d.deviceId === selectedCameraId)) {
        setSelectedCameraId(videos[0].deviceId)
      }
    } catch (error) {
      setStatus(makeStatus('error', t.status.cameraSwitchFailed(error.message)))
    }
  }

  const startVideoInference = async () => {
    if (!sessionRef.current) {
      setStatus(makeStatus('warning', t.status.loadModelBeforeVideo))
      return
    }
    const video = fileVideoRef.current
    if (!video || !video.src) {
      setStatus(makeStatus('warning', t.status.chooseVideoFirst))
      return
    }
    try {
      startOutputRecording()
      await video.play()
      setRunning(true)
      setStatus(makeStatus('success', t.status.videoStarted(effectiveMaxFps)))
    } catch (error) {
      setStatus(makeStatus('error', t.status.videoPlayFailed(error.message)))
    }
  }

  const stopVideoInference = () => {
    cleanupCamera()
    stopOutputRecording()
    const video = fileVideoRef.current
    if (video) video.pause()
    setStatus(makeStatus('info', t.status.videoStopped))
  }

  const downloadEnhancedOutput = () => {
    if (sourceMode === 'video') {
      if (!recordedVideoUrlRef.current) {
        setStatus(makeStatus('warning', t.status.noVideoToDownload))
        return
      }
      const a = document.createElement('a')
      a.href = recordedVideoUrlRef.current
      a.download = `enhanced-video.${recordedVideoExtRef.current}`
      a.click()
      return
    }
    const canvas = outputCanvasRef.current
    if (!canvas) return
    const mime = imageDownloadFormat === 'jpg' ? 'image/jpeg' : 'image/png'
    const a = document.createElement('a')
    a.href = canvas.toDataURL(mime)
    a.download = `enhanced-image.${imageDownloadFormat}`
    a.click()
  }

  useEffect(() => {
    if (running) startLoop()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [running, effectiveMaxFps, sourceMode])

  useEffect(() => {
    refreshOnlineModelList(false)
  }, [])

  useEffect(() => {
    if (sourceMode === 'camera') {
      refreshCameraDevices(true)
    }
  }, [sourceMode])

  useEffect(
    () => () => {
      cleanupCamera()
      stopOutputRecording()
      if (onlineModelAbortRef.current) onlineModelAbortRef.current.abort()
      if (imageObjectUrlRef.current) URL.revokeObjectURL(imageObjectUrlRef.current)
      if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current)
      if (recordedVideoUrlRef.current) URL.revokeObjectURL(recordedVideoUrlRef.current)
    },
    []
  )

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setActiveFullscreen('')
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const toggleFullscreen = async (target) => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      const el = target === 'input' ? inputPanelRef.current : outputPanelRef.current
      if (!el?.requestFullscreen) return
      await el.requestFullscreen()
      setActiveFullscreen(target)
    } catch {
      setStatus(makeStatus('warning', t.status.fullscreenUnavailable))
    }
  }

  const statusSeverity =
    status.level === 'error'
      ? 'error'
      : status.level === 'warning'
        ? 'warning'
        : status.level === 'success'
          ? 'success'
          : 'info'

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ minHeight: '100vh', background: 'linear-gradient(140deg, #e8edf5 0%, #f4f7fb 40%, #dee7f3 100%)' }}>
        <AppBar position="fixed" color="transparent" elevation={0} sx={{ backdropFilter: 'blur(8px)' }}>
          <Toolbar sx={{ borderBottom: '1px solid #d0d8e5', minHeight: `${appBarHeight}px !important`, px: { xs: 1, sm: 2 } }}>
            {isMobile && (
              <Button variant="outlined" size="small" sx={{ mr: 1 }} onClick={() => setMobileDrawerOpen(true)}>
                {t.ui.menu}
              </Button>
            )}
            <MemoryRoundedIcon sx={{ mr: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.25rem' } }}>{t.ui.appTitle}</Typography>
            <Box sx={{ flexGrow: 1 }} />
            {!isMobile && <Chip size="medium" label={`${t.ui.fps}: ${currentFps}`} color="secondary" />}
            {!isMobile && <Box sx={{ width: 8 }} />}
            {!isMobile && <Chip label={`${t.ui.latency}: ${processMs} ms`} color="primary" variant="outlined" />}
          </Toolbar>
        </AppBar>

        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={isMobile ? mobileDrawerOpen : true}
          onClose={() => setMobileDrawerOpen(false)}
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: { xs: 'min(92vw, 360px)', md: drawerWidth },
              boxSizing: 'border-box',
              top: appBarHeight,
              height: `calc(100% - ${appBarHeight}px)`,
              borderRight: '1px solid #d0d8e5',
              background: '#f8fbff'
            }
          }}
        >
          <Stack spacing={2} sx={{ p: { xs: 1.5, sm: 2.5 } }}>
            <Typography variant="h5">{t.ui.panel}</Typography>
            <FormControl size="small" fullWidth>
              <InputLabel id="model-source-label">{t.ui.modelSource}</InputLabel>
              <Select
                labelId="model-source-label"
                value={modelSource}
                label={t.ui.modelSource}
                onChange={(e) => setModelSource(e.target.value)}
              >
                <MenuItem value="online">{t.ui.onlineModel}</MenuItem>
                <MenuItem value="local">{t.ui.localModel}</MenuItem>
              </Select>
            </FormControl>

            {modelSource === 'online' ? (
              <>
                <FormControl size="small" fullWidth>
                  <InputLabel id="online-model-list-label">{t.ui.modelList}</InputLabel>
                  <Select
                    labelId="online-model-list-label"
                    value={selectedOnlineModel}
                    label={t.ui.modelList}
                    onChange={(e) => setSelectedOnlineModel(e.target.value)}
                  >
                    {onlineModels.map((item) => (
                      <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  onClick={() => refreshOnlineModelList(true)}
                  disabled={refreshingModelList}
                  startIcon={refreshingModelList ? <CircularProgress size={14} /> : null}
                >
                  {refreshingModelList ? `${t.ui.forceRefreshModelList}...` : t.ui.forceRefreshModelList}
                </Button>
                <Button variant="contained" onClick={loadOnlineModel}>{t.ui.loadOnlineModel}</Button>
                <Button variant="outlined" onClick={clearModelCache}>{t.ui.clearModelCache}</Button>
                <Typography variant="caption">{t.ui.cacheHint}</Typography>
                <Typography variant="caption">{t.ui.lastRefreshTime}: {modelListRefreshTimeText}</Typography>
              </>
            ) : (
              <>
                <Button variant="contained" onClick={() => modelInputRef.current?.click()}>
                  {t.ui.chooseModel}
                </Button>
                <input hidden ref={modelInputRef} type="file" accept=".onnx" onChange={handleModelFile} />
              </>
            )}
            <Chip label={`${t.ui.model}: ${modelName}`} />

            <FormControl size="small" fullWidth>
              <InputLabel id="lang-label">{t.ui.language}</InputLabel>
              <Select
                labelId="lang-label"
                value={lang}
                label={t.ui.language}
                onChange={(e) => setLang(e.target.value)}
              >
                <MenuItem value="zh">{t.ui.chinese}</MenuItem>
                <MenuItem value="en">{t.ui.english}</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="provider-label">{t.ui.provider}</InputLabel>
              <Select
                labelId="provider-label"
                value={provider}
                label={t.ui.provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {providerOptions.map((item) => (
                  <MenuItem key={item} value={item}>{item.toUpperCase()}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="image-format-label">{t.ui.imageFormat}</InputLabel>
              <Select
                labelId="image-format-label"
                value={imageDownloadFormat}
                label={t.ui.imageFormat}
                onChange={(e) => setImageDownloadFormat(e.target.value)}
              >
                <MenuItem value="png">PNG</MenuItem>
                <MenuItem value="jpg">JPG</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="video-format-label">{t.ui.videoFormat}</InputLabel>
              <Select
                labelId="video-format-label"
                value={videoDownloadFormat}
                label={t.ui.videoFormat}
                onChange={(e) => setVideoDownloadFormat(e.target.value)}
              >
                <MenuItem value="mp4">MP4</MenuItem>
                <MenuItem value="webm">WEBM</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="render-path-label">{t.ui.renderPath}</InputLabel>
              <Select
                labelId="render-path-label"
                value={renderPath}
                label={t.ui.renderPath}
                onChange={(e) => setRenderPath(e.target.value)}
              >
                <MenuItem value="putImageData">{t.ui.renderPathPutImageData}</MenuItem>
                <MenuItem value="imageBitmap">{t.ui.renderPathImageBitmap}</MenuItem>
              </Select>
            </FormControl>

            <Divider />

            <ButtonGroup fullWidth orientation={isMobile ? 'vertical' : 'horizontal'}>
              <Button
                variant={sourceMode === 'image' ? 'contained' : 'outlined'}
                startIcon={<PhotoRoundedIcon />}
                onClick={() => {
                  stopCamera()
                  setSourceMode('image')
                  setMobileDrawerOpen(false)
                }}
              >
                {t.ui.image}
              </Button>
              <Button
                variant={sourceMode === 'camera' ? 'contained' : 'outlined'}
                startIcon={<CameraAltRoundedIcon />}
                onClick={() => {
                  setSourceMode('camera')
                  setMobileDrawerOpen(false)
                }}
              >
                {t.ui.camera}
              </Button>
              <Button
                variant={sourceMode === 'video' ? 'contained' : 'outlined'}
                startIcon={<MovieRoundedIcon />}
                onClick={() => {
                  stopCamera()
                  setSourceMode('video')
                  setMobileDrawerOpen(false)
                }}
              >
                {t.ui.video}
              </Button>
            </ButtonGroup>

            <FormControl size="small" fullWidth>
              <InputLabel id="fps-mode-label">{t.ui.fpsMode}</InputLabel>
              <Select
                labelId="fps-mode-label"
                value={fpsMode}
                label={t.ui.fpsMode}
                onChange={(e) => setFpsMode(e.target.value)}
              >
                <MenuItem value="manual">{t.ui.fpsModeManual}</MenuItem>
                <MenuItem value="auto">{t.ui.fpsModeAuto}</MenuItem>
              </Select>
            </FormControl>
            <Typography gutterBottom>
              {fpsMode === 'auto'
                ? `${t.ui.maxFps}: ${autoMaxFps} FPS (${t.ui.auto})`
                : `${t.ui.maxFps}: ${maxFps} FPS`}
            </Typography>
            <Slider
              value={maxFps}
              min={1}
              max={120}
              step={1}
              valueLabelDisplay="auto"
              disabled={fpsMode === 'auto'}
              onChange={(_, value) => setMaxFps(Number(value))}
            />

            <Typography gutterBottom>
              {t.ui.inferenceScale}: {inferenceScale}% ({effectiveInferenceSize} x {effectiveInferenceSize})
            </Typography>
            <Slider
              value={inferenceScale}
              min={25}
              max={100}
              step={5}
              valueLabelDisplay="auto"
              onChange={(_, value) => setInferenceScale(Number(value))}
            />

            <Typography gutterBottom>{t.ui.sourceDownscale}: {sourceDownscale}%</Typography>
            <Slider
              value={sourceDownscale}
              min={25}
              max={100}
              step={5}
              valueLabelDisplay="auto"
              onChange={(_, value) => setSourceDownscale(Number(value))}
            />

            <Alert severity={statusSeverity}>{status.text}</Alert>
            {!!modelListRefreshErrorDetail && (
              <Box
                component="details"
                sx={{
                  mt: 0.5,
                  p: 1,
                  borderRadius: 1,
                  border: '1px solid #d7deea',
                  background: '#f7f9fc',
                  '& > summary': {
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }
                }}
              >
                <summary>{t.ui.errorDetail}</summary>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<ContentCopyRoundedIcon fontSize="inherit" />}
                  onClick={copyModelListErrorDetail}
                  sx={{ mt: 0.6, mb: 0.2, px: 0.5, minWidth: 0 }}
                >
                  {copiedErrorDetail ? t.ui.copied : t.ui.copyDetail}
                </Button>
                <Typography variant="caption" component="pre" sx={{ m: 0, mt: 0.8, whiteSpace: 'pre-wrap' }}>
                  {modelListRefreshErrorDetail}
                </Typography>
              </Box>
            )}
            <Stack spacing={0.8} sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{t.ui.envCheck}</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ width: '100%', minWidth: 0 }}>
                <Chip
                  size="small"
                  color={envStatus.secure ? 'success' : 'warning'}
                  label={`${t.ui.secureContext}: ${envStatus.secure ? t.ui.ok : t.ui.unavailable}`}
                  sx={{
                    width: { xs: '100%', sm: 'auto' },
                    maxWidth: '100%',
                    height: 'auto',
                    '& .MuiChip-label': {
                      display: 'block',
                      whiteSpace: 'normal',
                      py: 0.5,
                      lineHeight: 1.2
                    }
                  }}
                />
                <Chip
                  size="small"
                  color={envStatus.camera ? 'success' : 'warning'}
                  label={`${t.ui.cameraApi}: ${envStatus.camera ? t.ui.ok : t.ui.unavailable}`}
                  sx={{
                    width: { xs: '100%', sm: 'auto' },
                    maxWidth: '100%',
                    height: 'auto',
                    '& .MuiChip-label': {
                      display: 'block',
                      whiteSpace: 'normal',
                      py: 0.5,
                      lineHeight: 1.2
                    }
                  }}
                />
                <Chip
                  size="small"
                  color={envStatus.cache ? 'success' : 'warning'}
                  label={`${t.ui.cacheApi}: ${envStatus.cache ? t.ui.ok : t.ui.unavailable}`}
                  sx={{
                    width: { xs: '100%', sm: 'auto' },
                    maxWidth: '100%',
                    height: 'auto',
                    '& .MuiChip-label': {
                      display: 'block',
                      whiteSpace: 'normal',
                      py: 0.5,
                      lineHeight: 1.2
                    }
                  }}
                />
                <Chip
                  size="small"
                  color={envStatus.crypto ? 'success' : 'warning'}
                  label={`${t.ui.cryptoApi}: ${envStatus.crypto ? t.ui.ok : t.ui.unavailable}`}
                  sx={{
                    width: { xs: '100%', sm: 'auto' },
                    maxWidth: '100%',
                    height: 'auto',
                    '& .MuiChip-label': {
                      display: 'block',
                      whiteSpace: 'normal',
                      py: 0.5,
                      lineHeight: 1.2
                    }
                  }}
                />
              </Stack>
            </Stack>
          </Stack>
        </Drawer>

        <Box
          sx={{
            ml: { xs: 0, md: `${drawerWidth}px` },
            pt: { xs: `${appBarHeight + 12}px`, md: '80px' },
            p: { xs: 1.25, sm: 2.5 },
            pb: { xs: 10, md: 2.5 }
          }}
        >
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5}>
            <Card sx={{ flex: 1, minHeight: { xs: 280, md: 380 } }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="h6">{t.ui.input}</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label={activeFullscreen === 'input' ? t.ui.exitFullScreen : t.ui.fullScreen}
                      title={activeFullscreen === 'input' ? t.ui.exitFullScreen : t.ui.fullScreen}
                      onClick={() => toggleFullscreen('input')}
                    >
                      {activeFullscreen === 'input' ? <FullscreenExitRoundedIcon fontSize="small" /> : <FullscreenRoundedIcon fontSize="small" />}
                    </IconButton>
                    {isMobile && (
                      <Button size="small" variant="text" onClick={() => setMobileInputOpen((v) => !v)}>
                        {mobileInputOpen ? t.ui.hideSection : t.ui.showSection}
                      </Button>
                    )}
                  </Stack>
                </Stack>

                <Box ref={inputPanelRef} sx={{ background: '#f8fbff', p: activeFullscreen === 'input' ? 2 : 0, minHeight: activeFullscreen === 'input' ? '100vh' : 'auto' }}>
                {(!isMobile || mobileInputOpen) && (sourceMode === 'image' ? (
                  <Stack spacing={1.5}>
                    <Button variant="outlined" onClick={() => imageInputRef.current?.click()}>{t.ui.chooseImage}</Button>
                    <input hidden ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFile} />
                    <Typography variant="body2">{t.ui.size}: {imageSizeText}</Typography>
                    <canvas
                      ref={inputCanvasRef}
                      width={canvasSize.width}
                      height={canvasSize.height}
                      style={{
                        width: '100%',
                        height: 'auto',
                        maxHeight: activeFullscreen === 'input' ? '82vh' : '52vh',
                        borderRadius: 12,
                        background: '#091320'
                      }}
                    />
                    <Button variant="contained" onClick={runImageEnhance}>{t.ui.runImage}</Button>
                  </Stack>
                ) : sourceMode === 'camera' ? (
                  <Stack spacing={1.5}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                      <Typography variant="subtitle2">{t.ui.camera}</Typography>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant={cameraMirror ? 'contained' : 'outlined'}
                          onClick={() => setCameraMirror((v) => !v)}
                        >
                          {t.ui.mirrorCamera}
                        </Button>
                        <Button size="small" variant="outlined" onClick={switchCamera}>{t.ui.switchCamera}</Button>
                      </Stack>
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <FormControl size="small" fullWidth>
                        <InputLabel id="camera-list-label">{t.ui.cameraList}</InputLabel>
                        <Select
                          labelId="camera-list-label"
                          value={selectedCameraId}
                          label={t.ui.cameraList}
                          onChange={(e) => setSelectedCameraId(e.target.value)}
                        >
                          {cameraDevices.length > 0 ? (
                            cameraDevices.map((device, index) => (
                              <MenuItem key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                                {device.label || `${t.ui.camera} ${index + 1}`}
                              </MenuItem>
                            ))
                          ) : (
                            <MenuItem value="" disabled>{t.ui.noCameraOption}</MenuItem>
                          )}
                        </Select>
                      </FormControl>
                      <Button variant="outlined" onClick={refreshCameraDevices}>{t.ui.refreshCameraList}</Button>
                    </Stack>
                    <video
                      ref={cameraVideoRef}
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        maxHeight: activeFullscreen === 'input' ? '82vh' : '52vh',
                        borderRadius: 12,
                        background: '#091320',
                        transform: cameraMirror ? 'scaleX(-1)' : 'none'
                      }}
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <Button variant="contained" onClick={startCamera} disabled={running}>{t.ui.startCamera}</Button>
                      <Button variant="outlined" onClick={stopCamera} disabled={!running}>{t.ui.stopCamera}</Button>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(100, (currentFps / Math.max(effectiveMaxFps, 1)) * 100)} />
                  </Stack>
                ) : (
                  <Stack spacing={1.5}>
                    <Button variant="outlined" onClick={() => videoInputRef.current?.click()}>{t.ui.chooseVideo}</Button>
                    <input hidden ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoFile} />
                    <Typography variant="body2">{t.ui.info}: {videoInfoText}</Typography>
                    <video
                      ref={fileVideoRef}
                      playsInline
                      controls
                      muted
                      style={{
                        width: '100%',
                        maxHeight: activeFullscreen === 'input' ? '82vh' : '52vh',
                        borderRadius: 12,
                        background: '#091320'
                      }}
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <Button variant="contained" onClick={startVideoInference} disabled={running}>{t.ui.startVideo}</Button>
                      <Button variant="outlined" onClick={stopVideoInference} disabled={!running}>{t.ui.stopInfer}</Button>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(100, (currentFps / Math.max(effectiveMaxFps, 1)) * 100)} />
                  </Stack>
                ))}
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1, minHeight: { xs: 280, md: 380 } }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="h6">{t.ui.output}</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label={activeFullscreen === 'output' ? t.ui.exitFullScreen : t.ui.fullScreen}
                      title={activeFullscreen === 'output' ? t.ui.exitFullScreen : t.ui.fullScreen}
                      onClick={() => toggleFullscreen('output')}
                    >
                      {activeFullscreen === 'output' ? <FullscreenExitRoundedIcon fontSize="small" /> : <FullscreenRoundedIcon fontSize="small" />}
                    </IconButton>
                    {isMobile && (
                      <Button size="small" variant="text" onClick={() => setMobileOutputOpen((v) => !v)}>
                        {mobileOutputOpen ? t.ui.hideSection : t.ui.showSection}
                      </Button>
                    )}
                  </Stack>
                </Stack>
                <Box ref={outputPanelRef} sx={{ background: '#f8fbff', p: activeFullscreen === 'output' ? 2 : 0, minHeight: activeFullscreen === 'output' ? '100vh' : 'auto' }}>
                {(!isMobile || mobileOutputOpen) && (
                  <>
                    <Typography variant="body2" sx={{ mb: 1 }}>{t.ui.modelSize}: {modelInputSize} x {modelInputSize}</Typography>
                    <canvas
                      ref={outputCanvasRef}
                      width={canvasSize.width}
                      height={canvasSize.height}
                      style={{
                        width: '100%',
                        height: 'auto',
                        maxHeight: activeFullscreen === 'output' ? '82vh' : '52vh',
                        borderRadius: 12,
                        background: '#03101d'
                      }}
                    />
                    <Button sx={{ mt: 1.5 }} variant="contained" onClick={downloadEnhancedOutput}>
                      {sourceMode === 'video' ? t.ui.dlVideo : t.ui.dlImage}
                    </Button>
                  </>
                )}
                </Box>
              </CardContent>
            </Card>
          </Stack>
        </Box>

        {isMobile && (
          <Box
            sx={{
              position: 'fixed',
              left: 10,
              right: 10,
              bottom: 10,
              zIndex: 1300,
              border: '1px solid #ccd7e8',
              borderRadius: 999,
              px: 1,
              py: 0.75,
              background: 'rgba(248, 251, 255, 0.94)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 1
            }}
          >
            <Chip size="small" label={`${t.ui.fps}: ${currentFps}`} color="secondary" />
            <Chip size="small" label={`${t.ui.latency}: ${processMs} ms`} color="primary" variant="outlined" />
          </Box>
        )}
      </Box>
    </ThemeProvider>
  )
}

export default App
