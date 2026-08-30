// 11 · 컨디션 체크 (마음 점수 + 감정칩 + 수면)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Chip, Button, CapLabel } from "../ui/primitives";
import { useAppStore } from "@/store/appStore";

const TAGS = ["기쁨", "차분", "사랑", "분노", "긴장", "슬픔", "공허", "피곤", "들뜸", "지침"];

export default function Condition() {
  const nav = useNavigate();
  const cur = useAppStore((s) => s.condition);
  const setCondition = useAppStore((s) => s.setCondition);
  const [score, setScore] = useState(cur.score);
  const [sleep, setSleep] = useState(cur.sleep);
  const [tags, setTags] = useState<string[]>(cur.tags);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const onSave = () => {
    setCondition(score, sleep, tags);
    nav(-1);
  };

  return (
    <>
      <StatusBar />
      <AppBar back title="컨디션 체크" />
      <Body>
        <Card>
          <CapLabel>마음 점수</CapLabel>
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 44, fontWeight: 800, color: "var(--iv-purple2)" }}>{score}</div>
            <div style={{ fontSize: 12, color: "var(--iv-txt2)", marginTop: 2 }}>
              {score >= 75 ? "맑고 단단해요" : score >= 50 ? "잔잔해요" : score >= 25 ? "조금 무거워요" : "쉬어가도 좋아요"}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--iv-purple2)" }}
          />
        </Card>

        <Card>
          <CapLabel>오늘 마음의 결</CapLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TAGS.map((t) => (
              <Chip key={t} active={tags.includes(t)} onClick={() => toggleTag(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </Card>

        <Card>
          <CapLabel>어젯밤 수면</CapLabel>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, padding: "10px 0" }}>
            <span style={{ fontSize: 36, fontWeight: 800 }}>{sleep}</span>
            <span style={{ color: "var(--iv-txt2)" }}>시간</span>
          </div>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={sleep}
            onChange={(e) => setSleep(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--iv-purple2)" }}
          />
        </Card>

        <Button block onClick={onSave}>
          기록하기
        </Button>
      </Body>
    </>
  );
}
