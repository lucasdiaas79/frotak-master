// Voz da Frotak IA sem rede: guarda de interrupcao enquanto a IA fala e destravamento da fala.
// npm run test:modules
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBargeInGuard,
  frameLevel,
} from "../src/modules/frotak-ai/domain/frotakLiveBargeInGuard.ts";
import { createStallWatch } from "../src/modules/frotak-ai/domain/frotakLiveStallWatch.ts";
import {
  createLiveTurn,
  isSilentModelSpeech,
} from "../src/modules/frotak-ai/domain/frotakLiveTurn.ts";

const FAIL = "Nao foi possivel consultar os dados da Frotak neste momento.";

const FRAME = 960; // 20 ms a 48 kHz

// Senoide com o nivel RMS pedido: basta para o guarda, que olha so o nivel de cada quadro.
function tone(level: number, seed = 0) {
  const frame = new Float32Array(FRAME);
  const amplitude = level * Math.SQRT2;
  for (let index = 0; index < FRAME; index += 1) {
    frame[index] = amplitude * Math.sin((index + seed) * 0.13);
  }
  return frame;
}

function isSilent(frames: Float32Array[]) {
  return frames.every((frame) => frameLevel(frame) === 0);
}

// Ensina o guarda: sala silenciosa e uma fala do usuario com a IA calada.
function trainedGuard() {
  const guard = createBargeInGuard();
  for (let index = 0; index < 50; index += 1) guard.process(tone(0.003, index), false);
  for (let index = 0; index < 150; index += 1) guard.process(tone(0.1, index), false);
  for (let index = 0; index < 50; index += 1) guard.process(tone(0.003, index), false);
  return guard;
}

test("IA calada: tudo passa, inclusive voz baixa", () => {
  const guard = createBargeInGuard();
  const soft = tone(0.008);
  const output = guard.process(soft, false);
  assert.equal(output.length, 1);
  assert.equal(output[0], soft);
});

test("IA falando: eco da propria voz vira silencio", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 100; index += 1) {
    assert.ok(isSilent(guard.process(tone(0.006, index), true)), `quadro ${index}`);
  }
});

test("IA falando: conversa ao fundo (10 dB abaixo do usuario) nao interrompe", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 150; index += 1) {
    assert.ok(isSilent(guard.process(tone(0.03, index), true)), `quadro ${index}`);
  }
});

test("IA falando: batida curta, mesmo alta, nao interrompe", () => {
  const guard = trainedGuard();
  const outputs = [
    ...[0, 1, 2, 3].map((index) => guard.process(tone(0.4, index), true)),
    ...[4, 5, 6].map((index) => guard.process(tone(0.002, index), true)),
  ];
  assert.ok(outputs.every(isSilent));
});

test("IA falando: voz do usuario libera a interrupcao sem perder o comeco", () => {
  const guard = trainedGuard();
  const outputs: Float32Array[][] = [];
  for (let index = 0; index < 14; index += 1) outputs.push(guard.process(tone(0.09, index), true));
  const opened = outputs.findIndex((frames) => !isSilent(frames));
  assert.equal(opened, 10, "abre no 11o quadro de voz (220 ms)");
  assert.ok(outputs[opened].length >= 11, "os quadros guardados seguem juntos");
  assert.equal(outputs[opened + 1].length, 1, "depois, um quadro por vez");
  assert.ok(guard.state().open);
});

test("IA falando: fala com pausas curtas entre as silabas tambem interrompe", () => {
  const guard = trainedGuard();
  const pattern = [1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1];
  const opened = pattern.findIndex(
    (voiced, index) => !isSilent(guard.process(tone(voiced ? 0.09 : 0.002, index), true)),
  );
  assert.equal(opened, 13, "abre quando junta 11 quadros de voz na janela");
});

test("IA falando: barulho intermitente, em metade dos quadros, nao interrompe", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 200; index += 1) {
    const level = index % 2 === 0 ? 0.2 : 0.002;
    assert.ok(isSilent(guard.process(tone(level, index), true)), `quadro ${index}`);
  }
});

test("IA falando: voz um pouco mais baixa que a de costume tambem interrompe", () => {
  const guard = trainedGuard();
  let opened = false;
  for (let index = 0; index < 20; index += 1) {
    if (!isSilent(guard.process(tone(0.05, index), true))) opened = true;
  }
  assert.ok(opened);
});

test("depois de liberada, a interrupcao fica aberta nas pausas curtas e fecha depois", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 12; index += 1) guard.process(tone(0.09, index), true);
  for (let index = 0; index < 30; index += 1) {
    assert.ok(!isSilent(guard.process(tone(0.002, index), true)), `pausa ${index}`);
  }
  for (let index = 0; index < 20; index += 1) guard.process(tone(0.002, index), true);
  assert.ok(isSilent(guard.process(tone(0.002), true)));
});

test("barulho da sala medido antes vira ponto de partida quando a IA comeca a falar", () => {
  const guard = createBargeInGuard();
  // Sala barulhenta (ventilador, conversa longe) enquanto a IA esta calada.
  for (let index = 0; index < 200; index += 1) guard.process(tone(0.012, index), false);
  for (let index = 0; index < 60; index += 1) {
    assert.ok(isSilent(guard.process(tone(0.03, index), true)), `quadro ${index}`);
  }
});

test("reset fecha a interrupcao", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 12; index += 1) guard.process(tone(0.09, index), true);
  guard.reset();
  assert.ok(isSilent(guard.process(tone(0.002), true)));
});

test("destravar: microfone quieto 2,5 s depois do inicio da fala, sem o fim, pede audioStreamEnd", () => {
  const watch = createStallWatch();
  watch.started();
  for (let index = 0; index < 60; index += 1) assert.equal(watch.frame(0.1, 0.1), false);
  const fired: number[] = [];
  for (let index = 0; index < 200; index += 1) if (watch.frame(0.003, 0.1)) fired.push(index);
  assert.deepEqual(fired, [124], "uma vez so, no 125o quadro quieto");
});

test("destravar: fala que continua, ou fim marcado pelo servidor, nao destrava", () => {
  const talking = createStallWatch();
  talking.started();
  for (let index = 0; index < 400; index += 1) {
    assert.equal(talking.frame(index % 100 < 90 ? 0.003 : 0.1, 0.1), false, `quadro ${index}`);
  }

  const ended = createStallWatch();
  ended.started();
  ended.ended();
  for (let index = 0; index < 400; index += 1) assert.equal(ended.frame(0.003, 0.1), false);

  const neverStarted = createStallWatch();
  for (let index = 0; index < 400; index += 1) assert.equal(neverStarted.frame(0.003, 0.1), false);
});

test("destravar: conversa ao fundo bem abaixo do usuario conta como quieto", () => {
  const watch = createStallWatch();
  watch.started();
  let fired = false;
  for (let index = 0; index < 130; index += 1) fired = watch.frame(0.012, 0.1) || fired;
  assert.ok(fired);
});

// Turno da conversa: sequencias de mensagens vistas em sessoes reais do Gemini Live.

test("turno: com consulta, fica em Pensando entre a frase de espera e a resposta", () => {
  const turn = createLiveTurn();
  turn.userStarted();
  assert.equal(turn.status(), "listening");
  turn.userEnded();
  assert.equal(turn.status(), "thinking");
  assert.equal(turn.modelAudio(3900), true, "frase de espera antes da consulta toca");
  assert.equal(
    turn.modelText("Certo, deixa so eu dar uma olhada."),
    "Certo, deixa so eu dar uma olhada.",
  );
  turn.toolCalls(["t1"]);
  assert.equal(turn.status(), "thinking");
  assert.equal(turn.toolSettled("t1", { ok: true, answer: "Ha 2 veiculos sem viagem." }), true);
  assert.equal(turn.status(), "thinking", "consulta respondida, resposta ainda nao veio");
  assert.deepEqual(turn.turnComplete(FAIL), { kind: "continue" }, "turno da frase de espera");
  assert.equal(turn.status(), "thinking");
  assert.equal(turn.modelAudio(15000), true, "resposta toca");
  assert.equal(
    turn.modelText("Temos dois veiculos sem viagem."),
    "Temos dois veiculos sem viagem.",
  );
  assert.equal(turn.status(), "ready");
  assert.deepEqual(turn.turnComplete(FAIL), {
    kind: "done",
    text: "Temos dois veiculos sem viagem.",
    speak: null,
    failed: false,
  });
});

test("turno: usuario fala durante a consulta do briefing e a resposta dele toca", () => {
  const turn = createLiveTurn();
  turn.textSent();
  turn.modelAudio(1000);
  turn.modelText("Ja vou ver como esta a operacao.");
  turn.toolCalls(["b1"]);
  turn.userStarted();
  turn.toolCancelled(["b1"]);
  turn.interrupted();
  assert.deepEqual(turn.turnComplete(FAIL), { kind: "done", text: "", speak: null, failed: false });
  assert.equal(turn.status(), "listening");
  assert.equal(
    turn.toolSettled("b1", { ok: true }),
    false,
    "consulta cancelada nao volta ao modelo",
  );
  turn.userEnded();
  assert.equal(turn.status(), "thinking");
  assert.equal(turn.modelAudio(2000), true, "a resposta da pergunta nao pode ser descartada");
  assert.equal(
    turn.modelText("A capital do Parana e Curitiba."),
    "A capital do Parana e Curitiba.",
  );
  assert.deepEqual(turn.turnComplete(FAIL), {
    kind: "done",
    text: "A capital do Parana e Curitiba.",
    speak: null,
    failed: false,
  });
  assert.equal(turn.status(), "ready");
});

test("turno: resposta com audio vazio vira fala de reserva com o texto", () => {
  const turn = createLiveTurn();
  turn.userStarted();
  turn.userEnded();
  for (let index = 0; index < 96; index += 1) turn.modelAudio(0.04);
  assert.equal(turn.status(), "thinking", "pedacos de 2 bytes nao contam como fala");
  turn.modelText("A capital do Parana");
  turn.modelText(" e Curitiba.");
  assert.deepEqual(turn.turnComplete(FAIL), {
    kind: "done",
    text: "A capital do Parana e Curitiba.",
    speak: "A capital do Parana e Curitiba.",
    failed: false,
  });
});

test("turno: audio vazio sai no generationComplete, sem esperar o turnComplete que nao vem", () => {
  const turn = createLiveTurn();
  turn.userStarted();
  turn.userEnded();
  turn.modelAudio(0.04);
  turn.modelText("A capital do ");
  turn.modelText("Parana e Curitiba.");
  for (let index = 0; index < 16; index += 1) turn.modelAudio(0.04);
  assert.equal(turn.generationComplete(), "A capital do Parana e Curitiba.");
  assert.equal(turn.status(), "ready");
  assert.deepEqual(turn.turnComplete(FAIL), { kind: "done", text: "", speak: null, failed: false });
});

test("turno: generationComplete com audio normal, ou com consulta pendente, nao fala nada", () => {
  const spoken = createLiveTurn();
  spoken.userEnded();
  spoken.modelAudio(2300);
  spoken.modelText("A capital do Parana e Curitiba.");
  assert.equal(spoken.generationComplete(), null);

  const waiting = createLiveTurn();
  waiting.userEnded();
  waiting.modelText("Certo, deixa so eu dar uma olhada.");
  waiting.toolCalls(["t1"]);
  assert.equal(waiting.generationComplete(), null);
  assert.equal(waiting.status(), "thinking");
});

test("turno: texto sem audio e sem fim do servidor sai quando o relogio de resposta estoura", () => {
  const turn = createLiveTurn();
  turn.userEnded();
  turn.modelAudio(0.04);
  turn.modelText("Bom dia.");
  assert.deepEqual(turn.replyOverdue(), { overdue: true, speak: "Bom dia." });
  assert.equal(turn.status(), "ready");
});

test("turno: resposta da consulta que nao chega usa o texto pronto e o atraso nao toca", () => {
  const turn = createLiveTurn();
  turn.userStarted();
  turn.userEnded();
  turn.toolCalls(["f1"]);
  turn.toolSettled("f1", { ok: true, answer: "A frota tem 12 veiculos." });
  assert.deepEqual(turn.turnComplete(FAIL), { kind: "continue" });
  assert.deepEqual(turn.answerOverdue(FAIL), { overdue: true, speak: "A frota tem 12 veiculos." });
  assert.equal(turn.status(), "ready");
  assert.equal(turn.modelAudio(2000), false, "resposta atrasada nao toca por cima");
  assert.equal(turn.modelText("A frota tem 12 veiculos."), null);
  assert.deepEqual(turn.turnComplete(FAIL), { kind: "done", text: "", speak: null, failed: false });
  turn.userStarted();
  turn.userEnded();
  assert.equal(turn.modelAudio(2000), true, "pergunta seguinte volta ao normal");
});

test("turno: resposta que chegou nao dispara o texto pronto", () => {
  const turn = createLiveTurn();
  turn.userEnded();
  turn.toolCalls(["f1"]);
  turn.toolSettled("f1", { ok: true, answer: "A frota tem 12 veiculos." });
  turn.modelAudio(2500);
  assert.deepEqual(turn.answerOverdue(FAIL), { overdue: false });
});

test("turno: resposta da consulta so em texto, sem fim do servidor, sai pelo limite", () => {
  const turn = createLiveTurn();
  turn.userEnded();
  turn.toolCalls(["f1"]);
  turn.toolSettled("f1", { ok: true });
  turn.modelAudio(0.04);
  turn.modelText("A frota tem 12 veiculos.");
  assert.equal(turn.status(), "thinking");
  assert.deepEqual(turn.answerOverdue(FAIL), { overdue: true, speak: "A frota tem 12 veiculos." });
  assert.equal(turn.status(), "ready");
});

test("turno: consulta com falha tecnica fala o aviso e segura a resposta do modelo", () => {
  const turn = createLiveTurn();
  turn.userEnded();
  turn.toolCalls(["x1"]);
  assert.equal(turn.modelAudio(500), false, "nada toca com consulta pendente");
  turn.toolSettled("x1", { ok: false });
  assert.equal(turn.modelAudio(2000), false, "resposta depois de falha nao toca");
  assert.deepEqual(turn.turnComplete(FAIL), {
    kind: "done",
    text: FAIL,
    speak: FAIL,
    failed: true,
  });
  assert.equal(turn.modelAudio(2000), false, "turno seguinte do modelo sobre a falha nao toca");
  turn.turnComplete(FAIL);
  turn.userStarted();
  turn.userEnded();
  assert.equal(turn.modelAudio(2000), true);
});

test("turno: ruido que o modelo ignora volta para Pode falar", () => {
  const turn = createLiveTurn();
  turn.userStarted();
  turn.userEnded();
  assert.deepEqual(turn.turnComplete(FAIL), { kind: "done", text: "", speak: null, failed: false });
  assert.equal(turn.status(), "ready");

  const silent = createLiveTurn();
  silent.userStarted();
  silent.userEnded();
  assert.deepEqual(silent.replyOverdue(), { overdue: true, speak: null });
  assert.equal(silent.status(), "ready");
});

test("turno: texto digitado espera a resposta mesmo se o modelo for interrompido", () => {
  const turn = createLiveTurn();
  turn.textSent();
  turn.interrupted();
  assert.equal(turn.status(), "thinking");
});

test("audio vazio: so quando o audio nao cobre o texto", () => {
  assert.equal(isSilentModelSpeech("A capital do Parana e Curitiba.", 60), true);
  assert.equal(isSilentModelSpeech("A capital do Parana e Curitiba.", 2300), false);
  assert.equal(isSilentModelSpeech("Sim.", 450), false);
  assert.equal(isSilentModelSpeech("", 0), false);
});

test("turno: texto da resposta chega antes do som e a tela continua em Pensando", () => {
  const turn = createLiveTurn();
  turn.userEnded();
  turn.toolCalls(["t1"]);
  turn.toolSettled("t1", { ok: true });
  turn.modelText("A frota tem 12 veiculos.");
  assert.equal(turn.status(), "thinking");
  turn.modelAudio(1800);
  assert.equal(turn.status(), "ready", "com som tocando a sessao mostra Respondendo");
});
