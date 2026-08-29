import { VOICE_EXTENSION, mediaFilename, type MediaItem } from './media';

/** Сколько ждём, пока проигрывание подставит ссылку в общий `<audio>`. */
export const VOICE_RESOLVE_TIMEOUT_MS = 6000;
const POLL_INTERVAL_MS = 50;

/**
 * У голосового ссылки в DOM нет: MAX держит один общий `<audio>` на всё приложение
 * и подставляет `src` только когда сообщение начинают слушать. Поэтому единственный
 * способ узнать ссылку — нажать «play», дождаться смены `src` и сразу остановить.
 *
 * Побочный эффект: чужое голосовое после этого считается прослушанным. Обойти нечем —
 * ссылку выдаёт сервер именно на проигрывание.
 */
export async function resolveVoiceHref(
  doc: Document,
  play: HTMLButtonElement,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<string | undefined> {
  const snapshot = Array.from(doc.querySelectorAll<HTMLAudioElement>('audio')).map((audio) => ({
    audio, src: audio.currentSrc || audio.src, paused: audio.paused, time: audio.currentTime,
  }));
  const before = new Set(snapshot.map((entry) => entry.src).filter(Boolean));
  play.click();

  // Считаем попытки, а не стенные часы: с подменённым sleep опрос по Date.now()
  // выродился бы в холостой цикл на всю длительность таймаута.
  const attempts = Math.max(1, Math.ceil(timeoutMs / POLL_INTERVAL_MS));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const href = Array.from(doc.querySelectorAll<HTMLAudioElement>('audio'))
      .map((audio) => audio.currentSrc || audio.src)
      .find((source) => /^https?:/i.test(source) && !before.has(source));
    if (href) {
      restorePlayback(doc, snapshot, href);
      return href;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  restorePlayback(doc, snapshot);
  return undefined;
}

/** Возвращаем плеер в исходное состояние — мы его трогали только ради ссылки. */
function restorePlayback(doc: Document, snapshot: Array<{ audio: HTMLAudioElement; src: string; paused: boolean; time: number }>, resolvedHref?: string): void {
  const changed = Array.from(doc.querySelectorAll<HTMLAudioElement>('audio')).filter((audio) => {
    const prior = snapshot.find((entry) => entry.audio === audio);
    return !prior || (audio.currentSrc || audio.src) !== prior.src || (resolvedHref !== undefined && (audio.currentSrc || audio.src) === resolvedHref);
  });
  changed.forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
      const prior = snapshot.find((entry) => entry.audio === audio);
      if (prior && prior.src && prior.src !== resolvedHref) {
        audio.src = prior.src;
        audio.load();
        audio.currentTime = prior.time;
        if (!prior.paused) void audio.play().catch(() => undefined);
      }
    } catch {
      /* элемент уже отсоединён */
    }
  });
}

export function voiceItem(href: string, index: number): MediaItem {
  return { kind: 'voice', href, filename: mediaFilename('voice', href, index) };
}

export { VOICE_EXTENSION };
