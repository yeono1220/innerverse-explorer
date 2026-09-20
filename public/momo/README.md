# 모모 캐릭터 이미지 슬롯

- `momo.png` 를 이 폴더에 넣으면 채팅 아바타·스플래시·행성 위 2D 모모가 이 이미지로 바뀝니다.
- 권장: 정사각형, 투명 배경 PNG, 256×256 이상.
- 파일이 없으면 기존 CSS 모모가 그대로 보입니다 (코드 수정 불필요).
- 홈 화면의 3D 모모(`src/diorama/MomoCharacter.tsx`)는 별도 — 모델/스프라이트 교체는 개발자와 상의.

## 현재 momo.png
3D `MomoCharacter`(5단계·후광)를 `/dev/momo-render`(개발 서버 전용 페이지)에서 투명 배경으로
렌더해 여백을 잘라낸 것. 다시 뽑으려면:
`npm run dev` → `http://localhost:8080/dev/momo-render?stage=5&soul=%23c9c4f5&cz=0.95`
→ 브라우저 콘솔에서 `window.__captureMomo()` (PNG dataURL) → 저장.
