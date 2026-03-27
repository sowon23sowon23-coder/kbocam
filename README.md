# KBO Cam

KBO 경기장 느낌의 포토 프레임으로 사진을 촬영하고 저장하는 React + Vite 프로젝트입니다.

## Features

- 전면/후면 카메라 전환
- 카운트다운 촬영
- 줌 버튼 및 핀치 줌 지원
- 좌측 이벤트 배너와 사진 합성
- `4000 x 3000` PNG 이미지 저장

## Tech Stack

- React 18
- TypeScript
- Vite

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- 모바일 브라우저 환경에서 카메라 권한 허용이 필요합니다.
- 저장 결과물은 고정 해상도 `4000 x 3000`으로 생성됩니다.
