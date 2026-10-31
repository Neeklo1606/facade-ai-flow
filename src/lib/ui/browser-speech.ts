/**
 * Распознавание речи самим браузером (Web Speech API), без ключей и без сервера (ADR-057).
 * Есть не во всех браузерах: где его нет, кнопки микрофона нет вовсе (правило 3), а не
 * кнопка, которая ничего не делает. Расшифровка идёт в то же поле, что и текст.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useBrowserSpeech(onText: (text: string) => void): {
  supported: boolean;
  listening: boolean;
  error: string | null;
  toggle: () => void;
} {
  // До монтирования неизвестно: на сервере кнопки нет, после — по браузеру
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<RecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => setSupported(ctor() !== null), []);

  const toggle = useCallback(() => {
    if (listening) {
      ref.current?.stop();
      return;
    }
    const Recognition = ctor();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onTextRef.current(text);
    };
    recognition.onerror = (event) =>
      setError(
        event.error === "not-allowed"
          ? "Нет доступа к микрофону. Разрешите его в браузере или напишите текстом."
          : "Речь не распознана. Повторите или напишите текстом.",
      );
    recognition.onend = () => setListening(false);
    ref.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }, [listening]);

  useEffect(() => () => ref.current?.stop(), []);

  return { supported, listening, error, toggle };
}
