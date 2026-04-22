# @seizn/personas-kr

Synchronous loader and deterministic filter helpers for Seizn's bundled Korean persona seed sample.

## Install

```bash
pnpm add @seizn/personas-kr
```

## Usage

```ts
import { filterPersonas, loadSamplePersonas } from '@seizn/personas-kr';

const personas = loadSamplePersonas();
const seoulShopkeepers = filterPersonas(personas, {
  province: '서울',
  occupation: '판매',
  limit: 25,
});
```

`filterPersonas` always sorts matches by `uuid` ascending before applying `limit`. This keeps repeated seeding runs deterministic for the same fixture and criteria.

## Licensing

Package code is Apache-2.0. The bundled dataset sample is derived from NVIDIA Nemotron-Personas-Korea and is licensed under CC BY 4.0. See `LICENSE.dataset` and `ATTRIBUTION.md`.

Downstream products that display seeded personas must show visible attribution to NVIDIA Nemotron-Personas-Korea and preserve CC BY 4.0 provenance metadata with exported or stored seeded characters.
