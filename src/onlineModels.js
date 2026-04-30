export const MODEL_CACHE_NAME = 'zerodce-model-cache-v1'

export const ONLINE_MODELS = [
  {
    id: 'CPCA1',
    name: 'CPCA (test)',
    url: '/models/CPCA1.onnx',
    sha256: '2dec049134324df57a36c136ed501cd5a0d7e1705400cb5aefbf84541fabdb58'
  },
  {
    id: 'zerodce_normal',
    name: 'ZeroDCE (normal)',
    url: '/models/zerodce.onnx',
    sha256: 'a2e755ad3af8bc4ae598512aeccfcc63a9b79bfbe9d01ebe4dd873e460173166'
  },
  {
    id: 'ZeroDCE_int8',
    name: 'ZeroDCE (INT8)',
    url: '/models/zerodce_int8.onnx',
    sha256: '2dec049134324df57a36c136ed501cd5a0d7e1705400cb5aefbf84541fabdb58'
  },
  {
    id: 'zerodce_fp16',
    name: 'ZeroDCE (FP16)',
    url: '/models/zerodce_fp16.onnx',
    sha256: 'e3fe69af14358a1d3d397002766078d23ab8b036380475a46c5699700daf2ab1'
  },
  {
    id: 'zerodce_fp32',
    name: 'ZeroDCE (FP32)',
    url: '/models/zerodce_fp32.onnx',
    sha256: 'a2e755ad3af8bc4ae598512aeccfcc63a9b79bfbe9d01ebe4dd873e460173166'
  }
]
