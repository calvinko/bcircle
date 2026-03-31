import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarDays,
  Search,
  ListChecks,
  User,
  BarChart3,
  Home,
  Settings,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { bibleBooks } from "./bibleBooks";

const oldTestament = bibleBooks.slice(0, 39);
const newTestament = bibleBooks.slice(39);
const STORAGE_KEY = "bible-reading-progress-v6";
const SETTINGS_KEY = "bible-reading-settings-v5";
const PROFILE_KEY = "bible-reading-profile-v4";
const API_BASE = "https://biblecircle.org/api/api";

const DEFAULT_SETTINGS = {
  selectedPlan: "whole-bible",
  search: "",
  days: "365",
  activeReference: "Genesis 1",
  mainPage: "reader",
  translation: "web",
  showTodaysReading: true,
  showAdditionalReader: false,
  additionalTranslation: "kjv",
};

const DEFAULT_PROFILE = {
  name: "Bible Reader",
  email: "reader@example.com",
  goal: "Read every day",
};

const translations = [
  { id: "web", label: "World English Bible (WEB)" },
  { id: "kjv", label: "King James Version (KJV)" },
  { id: "asv", label: "American Standard Version (ASV)" },
  { id: "bbe", label: "Bible in Basic English (BBE)" },
  { id: "cuv", label: "Chinese Union Version (CUV)" },
];

const allChapters = bibleBooks.flatMap((book) =>
  Array.from({ length: book.chapters }, (_, i) => ({
    book: book.name,
    bookId: book.id,
    chapter: i + 1,
    label: `${book.name} ${i + 1}`,
  }))
);

function makeInitialProgress() {
  const progress = {};
  bibleBooks.forEach((book) => {
    progress[book.name] = Array.from({ length: book.chapters }, () => false);
  });
  return progress;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeInitialProgress();
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return makeInitialProgress();
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return DEFAULT_PROFILE;
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function normalizeProgress(progress = {}) {
  const fallback = makeInitialProgress();
  for (const book of bibleBooks) {
    if (Array.isArray(progress[book.name])) {
      fallback[book.name] = Array.from(
        { length: book.chapters },
        (_, i) => Boolean(progress[book.name][i])
      );
    }
  }
  return fallback;
}

function normalizeSettings(settings = {}) {
  return {
    selectedPlan:
      typeof settings.selectedPlan === "string"
        ? settings.selectedPlan
        : DEFAULT_SETTINGS.selectedPlan,
    search: typeof settings.search === "string" ? settings.search : DEFAULT_SETTINGS.search,
    days: typeof settings.days === "string" ? settings.days : DEFAULT_SETTINGS.days,
    activeReference:
      typeof settings.activeReference === "string"
        ? settings.activeReference
        : DEFAULT_SETTINGS.activeReference,
    mainPage:
      typeof settings.mainPage === "string"
        ? settings.mainPage
        : DEFAULT_SETTINGS.mainPage,
    translation:
      typeof settings.translation === "string"
        ? settings.translation
        : DEFAULT_SETTINGS.translation,
    showTodaysReading:
      typeof settings.showTodaysReading === "boolean"
        ? settings.showTodaysReading
        : DEFAULT_SETTINGS.showTodaysReading,
    showAdditionalReader:
      typeof settings.showAdditionalReader === "boolean"
        ? settings.showAdditionalReader
        : DEFAULT_SETTINGS.showAdditionalReader,
    additionalTranslation:
      typeof settings.additionalTranslation === "string"
        ? settings.additionalTranslation
        : DEFAULT_SETTINGS.additionalTranslation,
  };
}

function normalizeProfile(profile = {}) {
  return {
    name: typeof profile.name === "string" ? profile.name : DEFAULT_PROFILE.name,
    email: typeof profile.email === "string" ? profile.email : DEFAULT_PROFILE.email,
    goal: typeof profile.goal === "string" ? profile.goal : DEFAULT_PROFILE.goal,
  };
}

async function fetchStoredUserData() {
  const response = await fetch(`${API_BASE}/user-profile`);
  if (!response.ok) {
    throw new Error(`Failed to load stored user data (${response.status}).`);
  }
  return response.json();
}

async function saveStoredUserData(payload) {
  const response = await fetch(`${API_BASE}/user-profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to save stored user data (${response.status}).`);
  }

  return response.json();
}

function getPlanBooks(selectedPlan) {
  if (selectedPlan === "old-testament") return oldTestament;
  if (selectedPlan === "new-testament") return newTestament;
  return bibleBooks;
}

function getChaptersForPlan(selectedPlan) {
  return getPlanBooks(selectedPlan).flatMap((book) =>
    Array.from({ length: book.chapters }, (_, i) => ({
      book: book.name,
      bookId: book.id,
      chapter: i + 1,
      label: `${book.name} ${i + 1}`,
    }))
  );
}

function buildDailyPlan(selectedPlan, days) {
  const chapters = getChaptersForPlan(selectedPlan);
  const totalDays = Number(days);
  const size = Math.max(1, Math.ceil(chapters.length / totalDays));
  const plan = [];
  for (let i = 0; i < chapters.length; i += size) {
    plan.push(chapters.slice(i, i + size));
  }
  return plan.map((group, index) => ({ day: index + 1, chapters: group }));
}

function parseReference(reference) {
  const match = reference.match(/^(.*) (\d+)$/);
  if (!match) return null;
  const [, bookName, chapterStr] = match;
  const book = bibleBooks.find((b) => b.name === bookName);
  if (!book) return null;
  return {
    bookName,
    bookId: book.id,
    chapter: Number(chapterStr),
    maxChapter: book.chapters,
  };
}

async function fetchChapter(reference, translation) {
  const parsed = parseReference(reference);
  if (!parsed) throw new Error("Invalid chapter reference.");

  if (translation === "CUV"){
    return "haha";
  } else {
    const url = `https://bible-api.com/data/${translation}/${parsed.bookId}/${parsed.chapter}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load chapter (${response.status}).`);
    }
    const data = await response.json();

    return {
      translationName: data?.translation?.name || translation.toUpperCase(),
      verses: Array.isArray(data?.verses) ? data.verses : [],
    };
  }
  
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ children, className = "" }) {
  return <div className={`p-5 pb-2 ${className}`}>{children}</div>;
}

function CardContent({ children, className = "" }) {
  return <div className={`p-5 pt-2 ${className}`}>{children}</div>;
}

function Badge({ children, active = false }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
      }`}
    >
      {children}
    </span>
  );
}

function PrimaryButton({ children, className = "", variant = "solid", ...props }) {
  const styles =
    variant === "outline"
      ? "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
      : variant === "ghost"
        ? "bg-transparent text-slate-700 hover:bg-slate-100"
        : "bg-slate-900 text-white hover:bg-slate-800";

  return (
    <button
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium transition ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function TextInput({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500 ${className}`}
      {...props}
    />
  );
}

function SelectInput({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
    >
      {children}
    </select>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-slate-900 transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function ChapterTextContent({ loading, error, verses }) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-[92%] animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-[85%] animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-1.5">
      {verses.map((verse) => (
        <div key={`${verse.book_id}-${verse.chapter}-${verse.verse}`} className="flex gap-3">
          <div className="min-w-8 pt-0.5 text-right text-xs font-semibold text-slate-500">
            {verse.verse}
          </div>
          <p className="text-sm leading-5 text-slate-700 whitespace-pre-wrap">
            {verse.text?.trim()}
          </p>
        </div>
      ))}
    </div>
  );
}

function TabButton({ active, children, ...props }) {
  return (
    <button
      className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

function StatCard({ title, value, subtitle, progressValue }) {
  return (
    <Card>
      <CardHeader>
        <div className="text-sm font-medium text-slate-500">{title}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-slate-900 break-words">{value}</div>
        {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
        {typeof progressValue === "number" ? <ProgressBar value={progressValue} /> : null}
      </CardContent>
    </Card>
  );
}

export default function App() {
  const loadedSettings = loadSettings();
  const [progress, setProgress] = useState(loadProgress);
  const [search, setSearch] = useState(loadedSettings.search || "");
  const [selectedPlan, setSelectedPlan] = useState(loadedSettings.selectedPlan || "whole-bible");
  const [days, setDays] = useState(loadedSettings.days || "365");
  const [activeReference, setActiveReference] = useState(loadedSettings.activeReference || "Genesis 1");
  const [mainPage, setMainPage] = useState(loadedSettings.mainPage || "reader");
  const [translation, setTranslation] = useState(loadedSettings.translation || "web");
  const [showTodaysReading, setShowTodaysReading] = useState(
    loadedSettings.showTodaysReading ?? true
  );
  const [showAdditionalReader, setShowAdditionalReader] = useState(
    loadedSettings.showAdditionalReader ?? false
  );
  const [additionalTranslation, setAdditionalTranslation] = useState(
    loadedSettings.additionalTranslation || "kjv"
  );
  const [profile, setProfile] = useState(loadProfile);
  const [readerTab, setReaderTab] = useState("books");
  const [chapterData, setChapterData] = useState({ verses: [], translationName: "" });
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState("");
  const [additionalChapterData, setAdditionalChapterData] = useState({
    verses: [],
    translationName: "",
  });
  const [loadingAdditionalChapter, setLoadingAdditionalChapter] = useState(false);
  const [additionalChapterError, setAdditionalChapterError] = useState("");
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    state: "connecting",
    message: "Connecting to backend storage...",
    updatedAt: "",
  });

  const settings = useMemo(
    () =>
      normalizeSettings({
        search,
        selectedPlan,
        days,
        activeReference,
        mainPage,
        translation,
        showTodaysReading,
        showAdditionalReader,
        additionalTranslation,
      }),
    [
      search,
      selectedPlan,
      days,
      activeReference,
      mainPage,
      translation,
      showTodaysReading,
      showAdditionalReader,
      additionalTranslation,
    ]
  );

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveProfile(normalizeProfile(profile));
  }, [profile]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromBackend() {
      try {
        const data = await fetchStoredUserData();
        if (cancelled) return;

        const nextProgress = normalizeProgress(data.progress);
        const nextSettings = normalizeSettings(data.readingPlan);
        const nextProfile = normalizeProfile(data.profile);

        setProgress(nextProgress);
        setSearch(nextSettings.search);
        setSelectedPlan(nextSettings.selectedPlan);
        setDays(nextSettings.days);
        setActiveReference(nextSettings.activeReference);
        setMainPage(nextSettings.mainPage);
        setTranslation(nextSettings.translation);
        setShowTodaysReading(nextSettings.showTodaysReading);
        setShowAdditionalReader(nextSettings.showAdditionalReader);
        setAdditionalTranslation(nextSettings.additionalTranslation);
        setProfile(nextProfile);
        saveProgress(nextProgress);
        saveSettings(nextSettings);
        saveProfile(nextProfile);
        setSyncStatus({
          state: "connected",
          message: "Profile, reading plan, and progress are loading from backend storage.",
          updatedAt: data.updatedAt || "",
        });
      } catch {
        if (cancelled) return;
        setSyncStatus({
          state: "offline",
          message: "Backend unavailable. Using local storage on this device.",
          updatedAt: "",
        });
      } finally {
        if (!cancelled) setRemoteReady(true);
      }
    }

    hydrateFromBackend();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!remoteReady) return;

    const payload = {
      progress: normalizeProgress(progress),
      profile: normalizeProfile(profile),
      readingPlan: settings,
    };

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await saveStoredUserData(payload);
        if (cancelled) return;
        setSyncStatus({
          state: "connected",
          message: "Profile, reading plan, and progress are saved to backend storage.",
          updatedAt: data.updatedAt || "",
        });
      } catch {
        if (cancelled) return;
        setSyncStatus({
          state: "offline",
          message: "Could not reach backend. Latest changes remain in local storage.",
          updatedAt: "",
        });
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [progress, profile, settings, remoteReady]);

  useEffect(() => {
    let cancelled = false;

    async function loadChapter() {
      try {
        setLoadingChapter(true);
        setChapterError("");
        const data = await fetchChapter(activeReference, translation);
        if (!cancelled) setChapterData(data);
      } catch (error) {
        if (!cancelled) {
          setChapterError(error.message || "Unable to load chapter.");
          setChapterData({ verses: [], translationName: "" });
        }
      } finally {
        if (!cancelled) setLoadingChapter(false);
      }
    }

    loadChapter();
    return () => {
      cancelled = true;
    };
  }, [activeReference, translation]);

  useEffect(() => {
    if (!showAdditionalReader) return;

    let cancelled = false;

    async function loadAdditionalChapter() {
      try {
        setLoadingAdditionalChapter(true);
        setAdditionalChapterError("");
        const data = await fetchChapter(activeReference, additionalTranslation);
        if (!cancelled) setAdditionalChapterData(data);
      } catch (error) {
        if (!cancelled) {
          setAdditionalChapterError(error.message || "Unable to load chapter.");
          setAdditionalChapterData({ verses: [], translationName: "" });
        }
      } finally {
        if (!cancelled) setLoadingAdditionalChapter(false);
      }
    }

    loadAdditionalChapter();
    return () => {
      cancelled = true;
    };
  }, [activeReference, additionalTranslation, showAdditionalReader]);

  const planBooks = useMemo(() => getPlanBooks(selectedPlan), [selectedPlan]);
  const filteredBooks = useMemo(
    () =>
      planBooks.filter((book) =>
        book.name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [planBooks, search]
  );

  const stats = useMemo(() => {
    const totalChapters = planBooks.reduce((sum, book) => sum + book.chapters, 0);
    const readChapters = planBooks.reduce(
      (sum, book) => sum + progress[book.name].filter(Boolean).length,
      0
    );
    const completedBooks = planBooks.filter((book) => progress[book.name].every(Boolean)).length;
    return {
      totalChapters,
      readChapters,
      completedBooks,
      totalBooks: planBooks.length,
      percent: totalChapters === 0 ? 0 : Math.round((readChapters / totalChapters) * 100),
    };
  }, [planBooks, progress]);

  const dailyPlan = useMemo(() => buildDailyPlan(selectedPlan, days), [selectedPlan, days]);

  const nextUnread = useMemo(() => {
    const chapters = getChaptersForPlan(selectedPlan);
    return chapters.find((item) => !progress[item.book][item.chapter - 1]) || null;
  }, [progress, selectedPlan]);

  const todayPlan = useMemo(() => {
    const chapters = getChaptersForPlan(selectedPlan);
    const readCount = chapters.filter((item) => progress[item.book][item.chapter - 1]).length;
    const perDay = Math.max(1, Math.ceil(chapters.length / Number(days)));
    const dayIndex = Math.min(Math.floor(readCount / perDay), Math.max(dailyPlan.length - 1, 0));
    return dailyPlan[dayIndex] || null;
  }, [progress, selectedPlan, days, dailyPlan]);

  const activeReadState = useMemo(() => {
    const parsed = parseReference(activeReference);
    if (!parsed) return { book: null, chapter: null, maxChapter: 1, isRead: false };
    return {
      book: parsed.bookName,
      chapter: parsed.chapter,
      maxChapter: parsed.maxChapter,
      isRead: Boolean(progress[parsed.bookName]?.[parsed.chapter - 1]),
    };
  }, [activeReference, progress]);

  const toggleChapter = (bookName, chapterIndex) => {
    setProgress((prev) => {
      const next = { ...prev, [bookName]: [...prev[bookName]] };
      next[bookName][chapterIndex] = !next[bookName][chapterIndex];
      saveProgress(next);
      return next;
    });
  };

  const markChapterValue = (bookName, chapterIndex, value) => {
    setProgress((prev) => {
      const next = { ...prev, [bookName]: [...prev[bookName]] };
      next[bookName][chapterIndex] = value;
      saveProgress(next);
      return next;
    });
  };

  const markBook = (bookName, value) => {
    const book = bibleBooks.find((b) => b.name === bookName);
    if (!book) return;
    setProgress((prev) => {
      const next = {
        ...prev,
        [bookName]: Array.from({ length: book.chapters }, () => value),
      };
      saveProgress(next);
      return next;
    });
  };

  const goToAdjacentChapter = (direction) => {
    const parsed = parseReference(activeReference);
    if (!parsed) return;
    const currentIndex = bibleBooks.findIndex((b) => b.name === parsed.bookName);
    if (currentIndex === -1) return;

    if (direction === "prev") {
      if (parsed.chapter > 1) {
        setActiveReference(`${parsed.bookName} ${parsed.chapter - 1}`);
      } else if (currentIndex > 0) {
        const prevBook = bibleBooks[currentIndex - 1];
        setActiveReference(`${prevBook.name} ${prevBook.chapters}`);
      }
    }

    if (direction === "next") {
      if (parsed.chapter < parsed.maxChapter) {
        setActiveReference(`${parsed.bookName} ${parsed.chapter + 1}`);
      } else if (currentIndex < bibleBooks.length - 1) {
        const nextBook = bibleBooks[currentIndex + 1];
        setActiveReference(`${nextBook.name} 1`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-28 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-slate-900" />
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Bible Reading App
              </h1>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Read your assigned chapter, watch your progress, and manage your plan in profile.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <PrimaryButton
              variant="outline"
              onClick={() => setShowTodaysReading((value) => !value)}
              className="w-full md:w-auto"
            >
              <ListChecks className="mr-2 h-4 w-4" />
              {showTodaysReading ? "Hide today’s reading" : "Show today’s reading"}
            </PrimaryButton>
            <PrimaryButton
              variant="outline"
              onClick={() => setShowAdditionalReader((value) => !value)}
              className="w-full md:w-auto"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              {showAdditionalReader ? "Hide comparison pane" : "Show comparison pane"}
            </PrimaryButton>
          </div>
        </div>

        {mainPage === "reader" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Plan progress" value={`${stats.percent}%`} progressValue={stats.percent} />
              <StatCard title="Read chapters" value={stats.readChapters} subtitle={`of ${stats.totalChapters} chapters`} />
              <StatCard title="Completed books" value={stats.completedBooks} subtitle={`of ${stats.totalBooks} books`} />
              <StatCard
                title="Next chapter"
                value={nextUnread ? nextUnread.label : "Plan complete"}
                subtitle={nextUnread ? "Your next unread chapter" : "You finished this plan"}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                      <BookOpen className="h-5 w-5" />
                      Chapter reader
                    </div>
                    <SelectInput value={translation} onChange={setTranslation}>
                      {translations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </SelectInput>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
                    <SelectInput value={activeReference} onChange={setActiveReference}>
                      {allChapters.map((item) => (
                        <option key={item.label} value={item.label}>
                          {item.label}
                        </option>
                      ))}
                    </SelectInput>
                    <PrimaryButton variant="outline" onClick={() => goToAdjacentChapter("prev")}>
                      <ChevronLeft className="h-4 w-4" />
                    </PrimaryButton>
                    <PrimaryButton variant="outline" onClick={() => goToAdjacentChapter("next")}>
                      <ChevronRight className="h-4 w-4" />
                    </PrimaryButton>
                    <PrimaryButton variant="outline" onClick={() => setActiveReference((v) => `${v}`)}>
                      <RefreshCw className="h-4 w-4" />
                    </PrimaryButton>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-900">{activeReference}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {chapterData.translationName || "Loading translation..."}
                        </p>
                      </div>
                      {activeReadState.book && activeReadState.chapter ? (
                        <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={activeReadState.isRead}
                            onChange={(e) =>
                              markChapterValue(
                                activeReadState.book,
                                activeReadState.chapter - 1,
                                e.target.checked
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span>{activeReadState.isRead ? "Read" : "Unread"}</span>
                        </label>
                      ) : null}
                    </div>

                    <div className="mt-6 rounded-3xl bg-slate-50 p-4">
                      <ChapterTextContent
                        loading={loadingChapter}
                        error={chapterError}
                        verses={chapterData.verses}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {showAdditionalReader && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                        <BookOpen className="h-5 w-5" />
                        Additional reading pane
                      </div>
                      <SelectInput value={additionalTranslation} onChange={setAdditionalTranslation}>
                        {translations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </SelectInput>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900">{activeReference}</h2>
                          <p className="mt-1 text-sm text-slate-500">
                            {additionalChapterData.translationName || "Loading translation..."}
                          </p>
                        </div>
                        <Badge>{additionalTranslation.toUpperCase()}</Badge>
                      </div>

                      <div className="mt-6 rounded-3xl bg-slate-50 p-4">
                        <ChapterTextContent
                          loading={loadingAdditionalChapter}
                          error={additionalChapterError}
                          verses={additionalChapterData.verses}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {showTodaysReading && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                      <ListChecks className="h-5 w-5" />
                      Today’s reading
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      {todayPlan ? (
                        <>
                          <div className="text-sm text-slate-500">Current assignment</div>
                          <div className="mt-1 text-lg font-semibold text-slate-900">
                            Day {todayPlan.day}
                          </div>
                          <p className="mt-3 text-sm leading-7 text-slate-700">
                            {todayPlan.chapters.map((item) => item.label).join(", ")}
                          </p>
                        </>
                      ) : (
                        <div className="text-slate-600">No plan available</div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="text-sm text-slate-500">Plan summary</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {selectedPlan.replace(/-/g, " ")}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">Target length: {days} days</p>
                      <p className="mt-1 text-sm text-slate-600">Update plan settings in Profile.</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex gap-2 rounded-3xl bg-slate-100 p-1">
                    <TabButton active={readerTab === "books"} onClick={() => setReaderTab("books")}>
                      Books
                    </TabButton>
                    <TabButton
                      active={readerTab === "daily-plan"}
                      onClick={() => setReaderTab("daily-plan")}
                    >
                      Daily plan
                    </TabButton>
                  </div>

                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <TextInput
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search a book"
                      className="pl-10"
                    />
                  </div>
                </div>

                {readerTab === "books" && (
                  <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {filteredBooks.map((book) => {
                        const readCount = progress[book.name].filter(Boolean).length;
                        const done = readCount === book.chapters;
                        return (
                          <Card key={book.name} className="border-slate-200 shadow-none">
                            <CardHeader className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xl font-semibold text-slate-900">
                                    {book.name}
                                  </div>
                                  <p className="mt-1 text-sm text-slate-500">
                                    {readCount} / {book.chapters} chapters read
                                  </p>
                                </div>
                                {done && <Badge active>Completed</Badge>}
                              </div>
                              <ProgressBar value={(readCount / book.chapters) * 100} />
                              <div className="flex flex-wrap gap-2">
                                <PrimaryButton
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => markBook(book.name, true)}
                                >
                                  Mark all read
                                </PrimaryButton>
                                <PrimaryButton
                                  variant="ghost"
                                  className="text-xs"
                                  onClick={() => markBook(book.name, false)}
                                >
                                  Clear
                                </PrimaryButton>
                              </div>
                            </CardHeader>

                            <CardContent>
                              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8">
                                {progress[book.name].map((isRead, index) => (
                                  <label
                                    key={`${book.name}-${index + 1}`}
                                    className={`flex cursor-pointer items-center gap-2 rounded-2xl border p-2 text-sm transition hover:shadow-sm ${
                                      isRead
                                        ? "border-slate-300 bg-slate-100"
                                        : "border-slate-200 bg-white"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isRead}
                                      onChange={() => toggleChapter(book.name, index)}
                                      onClick={() =>
                                        setActiveReference(`${book.name} ${index + 1}`)
                                      }
                                      className="h-4 w-4 rounded border-slate-300"
                                    />
                                    <span
                                      onClick={() =>
                                        setActiveReference(`${book.name} ${index + 1}`)
                                      }
                                    >
                                      {index + 1}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {readerTab === "daily-plan" && (
                  <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                    {dailyPlan.map((item) => {
                      const doneCount = item.chapters.filter(
                        (chapter) => progress[chapter.book][chapter.chapter - 1]
                      ).length;
                      const done = doneCount === item.chapters.length;
                      return (
                        <Card key={item.day} className="border-slate-200 shadow-none">
                          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-slate-600" />
                                <span className="font-semibold text-slate-900">Day {item.day}</span>
                                {done ? <Badge active>Done</Badge> : null}
                              </div>
                              <p className="mt-2 text-sm text-slate-600">
                                {item.chapters.map((chapter) => chapter.label).join(", ")}
                              </p>
                            </div>
                            <div className="min-w-32">
                              <ProgressBar value={(doneCount / item.chapters.length) * 100} />
                              <p className="mt-2 text-right text-xs text-slate-500">
                                {doneCount}/{item.chapters.length} complete
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {mainPage === "progress" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Overall progress" value={`${stats.percent}%`} progressValue={stats.percent} />
              <StatCard title="Chapters read" value={stats.readChapters} subtitle="Tracked in this plan" />
              <StatCard title="Books completed" value={stats.completedBooks} subtitle="Finished from start to end" />
              <StatCard title="Plan length" value={days} subtitle="days selected" />
            </div>

            <Card>
              <CardHeader>
                <div className="text-xl font-semibold text-slate-900">Book-by-book progress</div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
                  {planBooks.map((book) => {
                    const readCount = progress[book.name].filter(Boolean).length;
                    const pct = Math.round((readCount / book.chapters) * 100);
                    return (
                      <div key={book.name} className="rounded-3xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{book.name}</div>
                            <div className="text-sm text-slate-500">
                              {readCount} of {book.chapters} chapters
                            </div>
                          </div>
                          <Badge active={pct === 100}>{pct}%</Badge>
                        </div>
                        <ProgressBar value={pct} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {mainPage === "profile" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                  <User className="h-5 w-5" />
                  User profile
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">Display name</p>
                    <TextInput
                      value={profile.name}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">Email</p>
                    <TextInput
                      value={profile.email}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">Reading goal</p>
                    <TextInput
                      value={profile.goal}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, goal: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-sm text-slate-500">Current chapter</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{activeReference}</div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-500">Backend sync</div>
                      <Badge active={syncStatus.state === "connected"}>
                        {syncStatus.state === "connected" ? "Connected" : "Offline"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {syncStatus.message}
                    </div>
                    {syncStatus.updatedAt ? (
                      <div className="mt-2 text-sm text-slate-500">
                        Last saved: {new Date(syncStatus.updatedAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-sm text-slate-500">Reading summary</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {stats.readChapters} chapters completed
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      Use the sections below to manage plan and app preferences.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                    <CalendarDays className="h-5 w-5" />
                    Reading plan
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Plan scope</p>
                    <div className="flex gap-2 rounded-3xl bg-slate-100 p-1">
                      <TabButton
                        active={selectedPlan === "whole-bible"}
                        onClick={() => setSelectedPlan("whole-bible")}
                      >
                        Whole
                      </TabButton>
                      <TabButton
                        active={selectedPlan === "old-testament"}
                        onClick={() => setSelectedPlan("old-testament")}
                      >
                        OT
                      </TabButton>
                      <TabButton
                        active={selectedPlan === "new-testament"}
                        onClick={() => setSelectedPlan("new-testament")}
                      >
                        NT
                      </TabButton>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Plan length</p>
                    <SelectInput value={days} onChange={setDays}>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                      <option value="365">365 days</option>
                    </SelectInput>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Bible translation</p>
                    <SelectInput value={translation} onChange={setTranslation}>
                      {translations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </SelectInput>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-sm text-slate-500">Today’s assignment</div>
                    {todayPlan ? (
                      <>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          Day {todayPlan.day}
                        </div>
                        <p className="mt-2 text-sm text-slate-700">
                          {todayPlan.chapters.map((item) => item.label).join(", ")}
                        </p>
                      </>
                    ) : (
                      <div className="mt-1 text-slate-600">No plan available</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                    <Settings className="h-5 w-5" />
                    App settings
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-sm text-slate-500">Current plan</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {selectedPlan.replace(/-/g, " ")}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-sm text-slate-500">Target length</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{days} days</div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-sm text-slate-500">Profile goal</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {profile.goal || "No goal set"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        <div className="fixed bottom-4 left-1/2 z-50 w-[min(720px,calc(100%-2rem))] -translate-x-1/2">
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
            <div className="grid grid-cols-3 gap-2">
              <PrimaryButton
                variant={mainPage === "reader" ? "solid" : "ghost"}
                className="h-14 rounded-2xl"
                onClick={() => setMainPage("reader")}
              >
                <span className="flex flex-col items-center gap-1">
                  <Home className="h-4 w-4" />
                  <span>Read</span>
                </span>
              </PrimaryButton>
              <PrimaryButton
                variant={mainPage === "progress" ? "solid" : "ghost"}
                className="h-14 rounded-2xl"
                onClick={() => setMainPage("progress")}
              >
                <span className="flex flex-col items-center gap-1">
                  <BarChart3 className="h-4 w-4" />
                  <span>Progress</span>
                </span>
              </PrimaryButton>
              <PrimaryButton
                variant={mainPage === "profile" ? "solid" : "ghost"}
                className="h-14 rounded-2xl"
                onClick={() => setMainPage("profile")}
              >
                <span className="flex flex-col items-center gap-1">
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </span>
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
