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
  Divider,
  Drawer,
  FormControl,
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
import * as ort from 'onnxruntime-web'
import { getMessages } from './i18n'
import { MODEL_CACHE_NAME, ONLINE_MODELS } from './onlineModels'

const drawerWidth = 320

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

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)))

function App() {
  const [lang, setLang] = useState(() => {
    const saved = window.localStorage.getItem('lang')
    if (saved === 'zh' || saved === 'en') return saved
    const systemLang = (window.navigator.language || '').toLowerCase()
    return systemLang.startsWith('zh') ? 'zh' : 'en'
  })
  const isMobile = useMediaQuery('(max-width:900px)')
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState('image')
  const [provider, setProvider] = useState('wasm')
  const [modelSource, setModelSource] = useState('online')
  const [selectedOnlineModel, setSelectedOnlineModel] = useState(ONLINE_MODELS[0].id)
  const [modelName, setModelName] = useState('')
  const [modelInputSize, setModelInputSize] = useState(256)
  const [status, setStatus] = useState(makeStatus('info', ''))
  const [running, setRunning] = useState(false)
  const [maxFps, setMaxFps] = useState(8)
  const [currentFps, setCurrentFps] = useState(0)
  const [processMs, setProcessMs] = useState(0)
  const [imageSizeText, setImageSizeText] = useState('-')
  const [videoInfoText, setVideoInfoText] = useState('-')
  const [imageDownloadFormat, setImageDownloadFormat] = useState('png')
  const [videoDownloadFormat, setVideoDownloadFormat] = useState('mp4')

  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const modelInputRef = useRef(null)
  const inputCanvasRef = useRef(null)
  const outputCanvasRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const fileVideoRef = useRef(null)
  const rafRef = useRef(0)
  const streamRef = useRef(null)
  const sessionRef = useRef(null)
  const modelInputNameRef = useRef('')
  const modelOutputNameRef = useRef('')
  const imageElementRef = useRef(null)
  const videoObjectUrlRef = useRef('')
  const processingRef = useRef(false)
  const lastInferAtRef = useRef(0)
  const fpsTimesRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordedVideoUrlRef = useRef('')
  const recordedVideoExtRef = useRef('webm')
  const recordedVideoMimeRef = useRef('video/webm')

  const providerOptions = useMemo(() => ['webgpu', 'webgl', 'wasm'], [])
  const t = useMemo(() => getMessages(lang), [lang])
  const envStatus = useMemo(() => {
    const secure = typeof window !== 'undefined' ? window.isSecureContext : false
    const camera = typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    const cache = typeof window !== 'undefined' && 'caches' in window
    const crypto = typeof window !== 'undefined' && !!(window.crypto && window.crypto.subtle)
    return { secure, camera, cache, crypto }
  }, [])

  const createSessionFromBuffer = async (buffer, displayName) => {
    const session = await ort.InferenceSession.create(buffer, {
      executionProviders: [provider]
    })
    sessionRef.current = session
    modelInputNameRef.current = session.inputNames[0]
    modelOutputNameRef.current = session.outputNames[0]
    const dims = session.inputMetadata[modelInputNameRef.current]?.dimensions || []
    const inferred = Number(dims[2])
    if (Number.isFinite(inferred) && inferred > 0) setModelInputSize(inferred)
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

  const preprocessToTensor = (sourceEl, size) => {
    const prep = document.createElement('canvas')
    prep.width = size
    prep.height = size
    const prepCtx = prep.getContext('2d', { willReadFrequently: true })
    prepCtx.drawImage(sourceEl, 0, 0, size, size)
    const imgData = prepCtx.getImageData(0, 0, size, size).data
    const floatData = new Float32Array(3 * size * size)
    for (let i = 0; i < size * size; i += 1) {
      floatData[i] = imgData[i * 4] / 255
      floatData[i + size * size] = imgData[i * 4 + 1] / 255
      floatData[i + 2 * size * size] = imgData[i * 4 + 2] / 255
    }
    return new ort.Tensor('float32', floatData, [1, 3, size, size])
  }

  const drawTensorToCanvas = (tensor, canvas) => {
    const h = tensor.dims[2]
    const w = tensor.dims[3]
    const frame = document.createElement('canvas')
    frame.width = w
    frame.height = h
    const frameCtx = frame.getContext('2d')
    const imageData = frameCtx.createImageData(w, h)
    const data = tensor.data
    for (let i = 0; i < w * h; i += 1) {
      const p = i * 4
      imageData.data[p] = clampByte(data[i] * 255)
      imageData.data[p + 1] = clampByte(data[i + w * h] * 255)
      imageData.data[p + 2] = clampByte(data[i + 2 * w * h] * 255)
      imageData.data[p + 3] = 255
    }
    frameCtx.putImageData(imageData, 0, 0)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(frame, 0, 0, frame.width, frame.height, 0, 0, canvas.width, canvas.height)
  }

  const runEnhanceOnElement = async (sourceEl, outputCanvas) => {
    if (!sessionRef.current) {
      setStatus(makeStatus('warning', t.status.loadModelFirst))
      return
    }
    const t0 = performance.now()
    const inputTensor = preprocessToTensor(sourceEl, modelInputSize)
    const feed = { [modelInputNameRef.current]: inputTensor }
    const result = await sessionRef.current.run(feed)
    drawTensorToCanvas(result[modelOutputNameRef.current], outputCanvas)
    setProcessMs(Math.round(performance.now() - t0))
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
    fpsTimesRef.current = []
    processingRef.current = false
  }

  const startOutputRecording = () => {
    const canvas = outputCanvasRef.current
    if (!canvas || mediaRecorderRef.current) return
    if (recordedVideoUrlRef.current) {
      URL.revokeObjectURL(recordedVideoUrlRef.current)
      recordedVideoUrlRef.current = ''
    }
    recordedChunksRef.current = []
    const stream = canvas.captureStream(Math.max(1, maxFps))
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
      const targetGap = 1000 / Math.max(1, maxFps)
      if (
        !processingRef.current &&
        now - lastInferAtRef.current >= targetGap &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        processingRef.current = true
        try {
          lastInferAtRef.current = now
          await runEnhanceOnElement(video, output)
          const times = fpsTimesRef.current
          times.push(now)
          while (times.length > 0 && now - times[0] > 1000) times.shift()
          setCurrentFps(times.length)
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
      const buffer = await file.arrayBuffer()
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
    const model = ONLINE_MODELS.find((item) => item.id === selectedOnlineModel)
    if (!model) return
    try {
      setStatus(makeStatus('info', t.status.loadingOnlineModel(model.name)))
      const hasCacheApi = typeof window !== 'undefined' && 'caches' in window
      let response = null
      if (hasCacheApi) {
        const cache = await window.caches.open(MODEL_CACHE_NAME)
        response = await cache.match(model.url)
        if (!response) {
          const fetched = await fetch(model.url)
          if (!fetched.ok) throw new Error(`${fetched.status} ${fetched.statusText}`)
          await cache.put(model.url, fetched.clone())
          response = fetched
        }
      } else {
        const fetched = await fetch(model.url)
        if (!fetched.ok) throw new Error(`${fetched.status} ${fetched.statusText}`)
        response = fetched
      }
      const buffer = await response.arrayBuffer()
      const valid = await verifySha256(buffer, model.sha256)
      if (valid === false) {
        if (hasCacheApi) {
          const cache = await window.caches.open(MODEL_CACHE_NAME)
          await cache.delete(model.url)
        }
        throw new Error(t.status.hashMismatch)
      }
      await createSessionFromBuffer(buffer, model.name)
      if (valid === null) {
        setStatus(makeStatus('warning', `${t.status.onlineModelCached(model.name)} (${t.status.integritySkipped})`))
      } else {
        setStatus(makeStatus('success', t.status.onlineModelCached(model.name)))
      }
    } catch (error) {
      sessionRef.current = null
      setStatus(makeStatus('error', t.status.onlineModelDownloadFailed(error.message)))
    }
  }

  const clearModelCache = async () => {
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        await window.caches.delete(MODEL_CACHE_NAME)
      }
      setStatus(makeStatus('success', t.status.modelCacheCleared))
    } catch (error) {
      setStatus(makeStatus('error', t.status.modelCacheClearFailed(error.message)))
    }
  }

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const img = new Image()
    img.onload = () => {
      imageElementRef.current = img
      const inputCanvas = inputCanvasRef.current
      const outputCanvas = outputCanvasRef.current
      if (!inputCanvas || !outputCanvas) return
      drawImageCover(inputCanvas.getContext('2d'), img, inputCanvas.width, inputCanvas.height)
      outputCanvas.getContext('2d').clearRect(0, 0, outputCanvas.width, outputCanvas.height)
      setImageSizeText(`${img.width} x ${img.height}`)
      setStatus(makeStatus('success', t.status.imageLoaded))
    }
    img.onerror = () => setStatus(makeStatus('error', t.status.imageLoadFailed))
    img.src = URL.createObjectURL(file)
    event.target.value = ''
  }

  const handleVideoFile = async (event) => {
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
      await runEnhanceOnElement(img, output)
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      streamRef.current = stream
      const video = cameraVideoRef.current
      video.srcObject = stream
      await video.play()
      setRunning(true)
      setStatus(makeStatus('success', t.status.cameraStarted(maxFps)))
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      })
      streamRef.current = stream
      const video = cameraVideoRef.current
      video.srcObject = stream
      await video.play()
      setRunning(true)
      setStatus(makeStatus('success', t.status.cameraSwitched))
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
      setStatus(makeStatus('success', t.status.videoStarted(maxFps)))
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
  }, [running, maxFps, sourceMode])

  useEffect(
    () => () => {
      cleanupCamera()
      stopOutputRecording()
      if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current)
      if (recordedVideoUrlRef.current) URL.revokeObjectURL(recordedVideoUrlRef.current)
    },
    []
  )

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
          <Toolbar sx={{ borderBottom: '1px solid #d0d8e5' }}>
            {isMobile && (
              <Button variant="outlined" size="small" sx={{ mr: 1 }} onClick={() => setMobileDrawerOpen(true)}>
                {t.ui.menu}
              </Button>
            )}
            <MemoryRoundedIcon sx={{ mr: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{t.ui.appTitle}</Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Chip label={`${t.ui.fps}: ${currentFps}`} color="secondary" />
            <Box sx={{ width: 8 }} />
            <Chip label={`${t.ui.latency}: ${processMs} ms`} color="primary" variant="outlined" />
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
              width: drawerWidth,
              boxSizing: 'border-box',
              top: 64,
              height: 'calc(100% - 64px)',
              borderRight: '1px solid #d0d8e5',
              background: '#f8fbff'
            }
          }}
        >
          <Stack spacing={2} sx={{ p: 2.5 }}>
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
                    {ONLINE_MODELS.map((item) => (
                      <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button variant="contained" onClick={loadOnlineModel}>{t.ui.loadOnlineModel}</Button>
                <Button variant="outlined" onClick={clearModelCache}>{t.ui.clearModelCache}</Button>
                <Typography variant="caption">{t.ui.cacheHint}</Typography>
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

            <Divider />

            <ButtonGroup fullWidth>
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

            <Typography gutterBottom>{t.ui.maxFps}: {maxFps} FPS</Typography>
            <Slider
              value={maxFps}
              min={1}
              max={30}
              step={1}
              valueLabelDisplay="auto"
              onChange={(_, value) => setMaxFps(Number(value))}
            />

            <Alert severity={statusSeverity}>{status.text}</Alert>
            <Stack spacing={0.8} sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{t.ui.envCheck}</Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  color={envStatus.secure ? 'success' : 'warning'}
                  label={`${t.ui.secureContext}: ${envStatus.secure ? t.ui.ok : t.ui.unavailable}`}
                />
                <Chip
                  size="small"
                  color={envStatus.camera ? 'success' : 'warning'}
                  label={`${t.ui.cameraApi}: ${envStatus.camera ? t.ui.ok : t.ui.unavailable}`}
                />
                <Chip
                  size="small"
                  color={envStatus.cache ? 'success' : 'warning'}
                  label={`${t.ui.cacheApi}: ${envStatus.cache ? t.ui.ok : t.ui.unavailable}`}
                />
                <Chip
                  size="small"
                  color={envStatus.crypto ? 'success' : 'warning'}
                  label={`${t.ui.cryptoApi}: ${envStatus.crypto ? t.ui.ok : t.ui.unavailable}`}
                />
              </Stack>
            </Stack>
          </Stack>
        </Drawer>

        <Box sx={{ ml: { xs: 0, md: `${drawerWidth}px` }, pt: '80px', p: 2.5 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5}>
            <Card sx={{ flex: 1, minHeight: 380 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1.5 }}>{t.ui.input}</Typography>

                {sourceMode === 'image' ? (
                  <Stack spacing={1.5}>
                    <Button variant="outlined" onClick={() => imageInputRef.current?.click()}>{t.ui.chooseImage}</Button>
                    <input hidden ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFile} />
                    <Typography variant="body2">{t.ui.size}: {imageSizeText}</Typography>
                    <canvas ref={inputCanvasRef} width={640} height={420} style={{ width: '100%', borderRadius: 12, background: '#091320' }} />
                    <Button variant="contained" onClick={runImageEnhance}>{t.ui.runImage}</Button>
                  </Stack>
                ) : sourceMode === 'camera' ? (
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2">{t.ui.camera}</Typography>
                      <Button size="small" variant="outlined" onClick={switchCamera}>{t.ui.switchCamera}</Button>
                    </Stack>
                    <video
                      ref={cameraVideoRef}
                      playsInline
                      muted
                      style={{ width: '100%', borderRadius: 12, background: '#091320', transform: 'scaleX(-1)' }}
                    />
                    <Stack direction="row" spacing={1.5}>
                      <Button variant="contained" onClick={startCamera} disabled={running}>{t.ui.startCamera}</Button>
                      <Button variant="outlined" onClick={stopCamera} disabled={!running}>{t.ui.stopCamera}</Button>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(100, (currentFps / Math.max(maxFps, 1)) * 100)} />
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
                      style={{ width: '100%', borderRadius: 12, background: '#091320' }}
                    />
                    <Stack direction="row" spacing={1.5}>
                      <Button variant="contained" onClick={startVideoInference} disabled={running}>{t.ui.startVideo}</Button>
                      <Button variant="outlined" onClick={stopVideoInference} disabled={!running}>{t.ui.stopInfer}</Button>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(100, (currentFps / Math.max(maxFps, 1)) * 100)} />
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card sx={{ flex: 1, minHeight: 380 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1.5 }}>{t.ui.output}</Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>{t.ui.modelSize}: {modelInputSize} x {modelInputSize}</Typography>
                <canvas ref={outputCanvasRef} width={640} height={420} style={{ width: '100%', borderRadius: 12, background: '#03101d' }} />
                <Button sx={{ mt: 1.5 }} variant="contained" onClick={downloadEnhancedOutput}>
                  {sourceMode === 'video' ? t.ui.dlVideo : t.ui.dlImage}
                </Button>
              </CardContent>
            </Card>
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
