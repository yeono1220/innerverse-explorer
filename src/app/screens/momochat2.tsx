const send = async (text: string) => {
  const t = text.trim();
  if (!t) return;
  const rule = REPLIES.find((r) => r.keys.test(t));
  const userMsg: Msg = { id: Date.now(), who: "me", text: t, emo: rule?.emo };

  // 사용자 메시지 + '생각 중' 버블을 즉시 표시 → 멈춘 느낌 제거
  const thinkingId = userMsg.id + 1;
  setMsgs((m) => [...m, userMsg, { id: thinkingId, who: "momo", text: "…" }]);
  setInput("");

  const history = [...msgs, userMsg].slice(-6).map((m) => `${m.who}: ${m.text}`);

  let reply = rule?.reply ?? "조금 더 들려줄래? 어떤 순간이었는지.";
  let memory: string[] = [];
  try {
    // 서로 독립인 두 조회를 병렬로 (직렬 → 병렬)
    const [hits, mem] = await Promise.all([ragContext(t), getMemory()]);
    memory = hits.map((h) => h.preview);
    const r = await momoReply({
      text: t,
      context: hits.map((h) => h.snippet),
      history,
      profile: memoryPromptBlock(mem),
    });
    if (r?.reply) reply = r.reply;
    if (r?.escalate) window.setTimeout(() => setCareOpen(true), 700);
  } catch {
    /* 백엔드 실패 → 로컬 규칙 답장 유지 */
  }
  // '생각 중' 버블을 실제 답장으로 교체
  setMsgs((m) => m.map((msg) => (msg.id === thinkingId ? { ...msg, text: reply, memory } : msg)));
};