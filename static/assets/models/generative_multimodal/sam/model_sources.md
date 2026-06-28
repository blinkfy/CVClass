# SAM Decoder Assets

This directory is the runtime contract for the `/generative-multimodal/sam`
Decoder-only real inference path.

## Intended Assets

- `sam_vit_b_mask_decoder.onnx`
  - Source model: Meta Segment Anything ViT-B checkpoint.
  - Export path: official Segment Anything ONNX mask decoder export.
  - License: Apache-2.0, inherited from Segment Anything.
  - Runtime use: browser-side ONNX Runtime Web mask decoder only.
- `embeddings/*.fp16.bin`
  - Shape: `[1, 256, 64, 64]`.
  - Dtype: little-endian float16.
  - Runtime use: offline Image Encoder output for each classroom sample.

## Current Repository State

The repository now includes:

- `sam_vit_b_mask_decoder.onnx`
- five classroom sample PNG files under `static/assets/generative_multimodal/sam_real/`
- five matching `.fp16.bin` image embeddings under `embeddings/`

`sam_model_manifest.json` marks the decoder and embeddings as available, and
`static/assets/data/generative_multimodal/sam_samples.json` marks the five
samples as `realInferenceReady`.

The current real-image samples were generated as 640x420 PNG classroom copies
from existing local assets:

- `street_vehicle.png`: `static/assets/frontier/vision-banana/depth/laguna-input.jpg`
- `desktop_objects.png`: `static/assets/frontier/vision-banana/refseg/controller-input.png`
- `animal_subject.png`: `static/assets/frontier/vision-banana/refseg/cats-input.jpeg`
- `medical_slice.png`: `static/assets/frontier/vision-banana/insseg/food-input.jpg`
- `indoor_scene.png`: `static/assets/img/classroom_students.jpg`

## References

- Segment Anything repository: https://github.com/facebookresearch/segment-anything
- ONNX Runtime Web deployment: https://onnxruntime.ai/docs/tutorials/web/deploy.html
- ONNX Runtime Web environment options: https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
