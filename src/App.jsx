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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  ListTree,
} from "lucide-react";
import { bibleBooks } from "./bibleBooks";
import LoginCard from "./login";

const oldTestament = bibleBooks.slice(0, 39);
const newTestament = bibleBooks.slice(39);
const STORAGE_KEY = "bible-reading-progress-v6";
const SETTINGS_KEY = "bible-reading-settings-v5";
const PROFILE_KEY = "bible-reading-profile-v4";
const AUTH_TOKEN_KEY = "bible-reading-auth-token-v1";
const AUTH_USER_KEY = "bible-reading-auth-user-v1";
const API_BASE = "https://biblecircle.org/app/api";



const DEFAULT_SETTINGS = {
  selectedPlan: "whole-bible",
  search: "",
  days: "365",
  activeReference: "Genesis 1",
  mainPage: "reader",
  translation: "web",
  readerFontSize: 15,
  showTodaysReading: false,
  showAdditionalReader: false,
  additionalTranslation: "kjv",
};

const DEFAULT_PROFILE = {
  name: "Bible Reader",
  email: "reader@example.com",
  goal: "Read every day",
};

const translations = [
  { id: "web", label: "World English Bible" },
  { id: "kjv", label: "King James Version" },
  { id: "esv", label: "English Standard Version" },
  { id: "asv", label: "American Standard Version" },
  { id: "bbe", label: "Bible in Basic English" },
  { id: "cuv", label: "Chinese Union Version" },
  { id: "net", label: "New English Translation" },
];

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

function loadAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function saveAuthToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function loadAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    return normalizeAuthUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveAuthUser(user) {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearAuthUser() {
  localStorage.removeItem(AUTH_USER_KEY);
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
  const parsedReaderFontSize =
    typeof settings.readerFontSize === "number"
      ? settings.readerFontSize
      : typeof settings.readerFontSize === "string" && settings.readerFontSize.trim() !== ""
        ? Number(settings.readerFontSize)
        : NaN;

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
    readerFontSize:
      Number.isFinite(parsedReaderFontSize)
        ? Math.max(12, Math.min(24, parsedReaderFontSize))
        : DEFAULT_SETTINGS.readerFontSize,
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

function getRemoteReadingPlan(settings = {}) {
  const normalized = normalizeSettings(settings);
  const { showTodaysReading: _showTodaysReading, ...remoteReadingPlan } = normalized;
  return remoteReadingPlan;
}

function normalizeProfile(profile = {}) {
  return {
    name: typeof profile.name === "string" ? profile.name : DEFAULT_PROFILE.name,
    email: typeof profile.email === "string" ? profile.email : DEFAULT_PROFILE.email,
    goal: typeof profile.goal === "string" ? profile.goal : DEFAULT_PROFILE.goal,
  };
}

function normalizeAuthUser(user = {}) {
  if (!user || typeof user !== "object") return null;
  return {
    userUuid: typeof user.userUuid === "string" ? user.userUuid : "",
    email: typeof user.email === "string" ? user.email : "",
  };
}

async function fetchStoredUserData(token) {
  const response = await fetch(`${API_BASE}/user-profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to load stored user data (${response.status}).`);
  }
  return response.json();
}

async function saveStoredUserData(payload, token) {
  const requestPayload = {
    ...payload,
    readingPlan: getRemoteReadingPlan(payload.readingPlan),
  };

  const response = await fetch(`${API_BASE}/user-profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    throw new Error(`Failed to save stored user data (${response.status}).`);
  }

  return response.json();
}

async function registerUser({ displayName, email, password }) {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ displayName, email, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to register (${response.status}).`);
  }
  return data;
}

async function loginUser({ email, password }) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to sign in (${response.status}).`);
  }
  return data;
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
  const bookIndex = bibleBooks.findIndex((b) => b.name === bookName);
  if (bookIndex === -1) return null;
  const book = bibleBooks[bookIndex];
  return {
    bookName,
    bookId: book.id,
    bookNumber: bookIndex + 1,
    chapter: Number(chapterStr),
    maxChapter: book.chapters,
  };
}

async function fetchChapter(reference, translation) {
  const parsed = parseReference(reference);
  if (!parsed) throw new Error("Invalid chapter reference.");
  // Special-case NET: fetch from labs.bible.org API which provides verse-level JSON
  if (translation === "net") {
    const passage = `${parsed.bookName} ${parsed.chapter}`;
    const url = `https://labs.bible.org/api/?passage=${encodeURIComponent(passage)}&type=json&version=NET`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load NET chapter (${response.status}).`);
    }
    const data = await response.json();
    // labs.bible.org returns an array of {bookname,chapter,verse,text}
    const verses = Array.isArray(data)
      ? data.map((v) => ({
          // keep shape compatible with existing verse rendering
          book_id: parsed.bookId,
          book_name: v.bookname || parsed.bookName,
          chapter: Number(v.chapter),
          verse: Number(v.verse),
          text: v.text || "",
        }))
      : [];

    return {
      translationName: "NET",
      verses,
    };
  }

  if (translation === "esv") {
    const url = `${API_BASE}/bible/${encodeURIComponent(parsed.bookName)}/${parsed.chapter}?version=ESV`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ESV chapter (${response.status}).`);
    }
    const data = await response.json();

    return {
      translationName: "ESV",
      verses: Array.isArray(data?.rows) ? data.rows : [],
    };
  } 

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
  return <div className={`p-2 lg:p-5 pt-2 ${className}`}>{children}</div>;
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

function SelectInput({ value, onChange, children, className = "", ...props }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500 ${className}`}
      {...props}
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

function ChapterTextContent({ loading, error, verses, fontSize }) {
  const sanitizeHtml = (html) => {
    if (typeof window === "undefined") return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    doc.querySelectorAll("script, style, iframe, object, embed, form").forEach((node) => {
      node.remove();
    });

    doc.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();

        if (name.startsWith("on")) {
          node.removeAttribute(attribute.name);
        }

        if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
          node.removeAttribute(attribute.name);
        }
      });
    });

    return doc.body.innerHTML;
  };

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

  const htmlVerse = verses.find(
    (verse) => verse.verse === "htmltext" && typeof verse.text === "string"
  );

  if (htmlVerse) {
    return (
      <div
        className="text-slate-700"
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlVerse.text) }}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {verses.map((verse) => (
        <div key={`${verse.book_id}-${verse.chapter}-${verse.verse}`} className="flex gap-3">
          <div className="min-w-2 lg:min-w-8 pt-0.5 text-right text-xs font-semibold text-slate-500">
            {verse.verse}
          </div>
          <p
            className="text-slate-700 whitespace-pre-wrap"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.45 }}
          >
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
  const [readerFontSize, setReaderFontSize] = useState(
    loadedSettings.readerFontSize ?? DEFAULT_SETTINGS.readerFontSize
  );
  const [showTodaysReading, setShowTodaysReading] = useState(
    loadedSettings.showTodaysReading ?? false
  );
  const [showAdditionalReader, setShowAdditionalReader] = useState(
    loadedSettings.showAdditionalReader ?? false
  );
  const [additionalTranslation, setAdditionalTranslation] = useState(
    loadedSettings.additionalTranslation || "kjv"
  );
  const [profile, setProfile] = useState(loadProfile);
  const [chapterData, setChapterData] = useState({ verses: [], translationName: "" });
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState("");
  const [additionalChapterData, setAdditionalChapterData] = useState({
    verses: [],
    translationName: "",
  });
  const [loadingAdditionalChapter, setLoadingAdditionalChapter] = useState(false);
  const [additionalChapterError, setAdditionalChapterError] = useState("");
  const [authToken, setAuthToken] = useState(loadAuthToken);
  const [currentUser, setCurrentUser] = useState(loadAuthUser);
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({
    displayName: "",
    email: "",
    password: "",
  });
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [remoteReady, setRemoteReady] = useState(false);
  const [savedProfile, setSavedProfile] = useState(() => normalizeProfile(loadProfile()));
  const [savedSettings, setSavedSettings] = useState(() => normalizeSettings(loadSettings()));
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [showDailyPlan, setShowDailyPlan] = useState(false);
  const [showChapterChooser, setShowChapterChooser] = useState(false);
  const [showTranslationChooser, setShowTranslationChooser] = useState(false);
  const [chapterChooserBook, setChapterChooserBook] = useState("");
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
        readerFontSize,
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
      readerFontSize,
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
    if (authToken) {
      saveAuthToken(authToken);
    } else {
      clearAuthToken();
    }
  }, [authToken]);

  useEffect(() => {
    if (currentUser) {
      saveAuthUser(currentUser);
    } else {
      clearAuthUser();
    }
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromBackend() {
      if (!authToken) {
        if (!cancelled) {
          setRemoteReady(true);
          setSyncStatus({
            state: "offline",
            message: "Signed out. Data is only stored on this device until you sign in.",
            updatedAt: "",
          });
        }
        return;
      }

      try {
        const data = await fetchStoredUserData(authToken);
        if (cancelled) return;

        const nextProgress = normalizeProgress(data.progress);
        const localSettings = loadSettings();
        const nextSettings = normalizeSettings({
          ...data.readingPlan,
          showTodaysReading: localSettings.showTodaysReading,
        });
        const nextProfile = normalizeProfile(data.profile);

        setProgress(nextProgress);
        setSearch(nextSettings.search);
        setSelectedPlan(nextSettings.selectedPlan);
        setDays(nextSettings.days);
        setActiveReference(nextSettings.activeReference);
        setMainPage(nextSettings.mainPage);
        setTranslation(nextSettings.translation);
        setReaderFontSize(nextSettings.readerFontSize);
        setShowTodaysReading(nextSettings.showTodaysReading);
        setShowAdditionalReader(nextSettings.showAdditionalReader);
        setAdditionalTranslation(nextSettings.additionalTranslation);
        setProfile(nextProfile);
        setSavedProfile(nextProfile);
        setSavedSettings(nextSettings);
        setCurrentUser((prev) => prev || normalizeAuthUser({ email: nextProfile.email }));
        saveProgress(nextProgress);
        saveSettings(nextSettings);
        saveProfile(nextProfile);
        setSyncStatus({
          state: "connected",
          message: "Signed in. Profile, reading plan, and progress are syncing.",
          updatedAt: data.updatedAt || "",
        });
      } catch (error) {
        if (cancelled) return;
        if (String(error.message || "").includes("(401)")) {
          clearAuthToken();
          clearAuthUser();
          setAuthToken("");
          setCurrentUser(null);
        }
        setSyncStatus({
          state: "offline",
          message: "Could not load your account data. Using local device storage.",
          updatedAt: "",
        });
      } finally {
        if (!cancelled) setRemoteReady(true);
      }
    }

    setRemoteReady(false);
    hydrateFromBackend();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    let cancelled = false;
    if (!remoteReady) return;
    if (!authToken) return;

    const payload = {
      progress: normalizeProgress(progress),
      profile: savedProfile,
      readingPlan: savedSettings,
    };

    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await saveStoredUserData(payload, authToken);
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
          message: "Could not reach backend. Latest changes remain on this device.",
          updatedAt: "",
        });
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [authToken, progress, savedProfile, savedSettings, remoteReady]);

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

  const activeBook = useMemo(
    () => bibleBooks.find((book) => book.name === activeReadState.book) || null,
    [activeReadState.book]
  );

  const chooserBook = useMemo(
    () => bibleBooks.find((book) => book.name === chapterChooserBook) || activeBook || bibleBooks[0],
    [chapterChooserBook, activeBook]
  );

  const chooserBookChapters = useMemo(() => {
    if (!chooserBook) return [];
    return Array.from({ length: chooserBook.chapters }, (_, index) => index + 1);
  }, [chooserBook]);

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

  const handleAuthFieldChange = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetGuestState = () => {
    const nextProgress = makeInitialProgress();
    setProgress(nextProgress);
    setSearch(DEFAULT_SETTINGS.search);
    setSelectedPlan(DEFAULT_SETTINGS.selectedPlan);
    setDays(DEFAULT_SETTINGS.days);
    setActiveReference(DEFAULT_SETTINGS.activeReference);
    setMainPage(DEFAULT_SETTINGS.mainPage);
    setTranslation(DEFAULT_SETTINGS.translation);
    setReaderFontSize(DEFAULT_SETTINGS.readerFontSize);
    setShowTodaysReading(DEFAULT_SETTINGS.showTodaysReading);
    setShowAdditionalReader(DEFAULT_SETTINGS.showAdditionalReader);
    setAdditionalTranslation(DEFAULT_SETTINGS.additionalTranslation);
    setProfile(DEFAULT_PROFILE);
    saveProgress(nextProgress);
    saveSettings(DEFAULT_SETTINGS);
    saveProfile(DEFAULT_PROFILE);
  };

  const handleAuthSuccess = ({ token, user }) => {
    const nextUser = normalizeAuthUser(user);
    setAuthToken(token);
    setCurrentUser(nextUser);
    saveAuthToken(token);
    if (nextUser) saveAuthUser(nextUser);
    setAuthError("");
    setAuthForm((prev) => ({ ...prev, password: "" }));
    setSyncStatus({
      state: "connecting",
      message: "Loading your account data...",
      updatedAt: "",
    });
  };

  const handleSignOut = () => {
    clearAuthToken();
    clearAuthUser();
    setAuthToken("");
    setCurrentUser(null);
    setAuthError("");
    setAuthForm({ displayName: "", email: "", password: "" });
    setSavedProfile(DEFAULT_PROFILE);
    setSavedSettings(DEFAULT_SETTINGS);
    resetGuestState();
    setSyncStatus({
      state: "offline",
      message: "Signed out. Data is only stored on this device until you sign in.",
      updatedAt: "",
    });
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");

    try {
      if (authMode === "register") {
        const result = await registerUser({
          displayName: authForm.displayName,
          email: authForm.email,
          password: authForm.password,
        });
        handleAuthSuccess(result);
      } else {
        const result = await loginUser({
          email: authForm.email,
          password: authForm.password,
        });
        handleAuthSuccess(result);
      }
    } catch (error) {
      setAuthError(error.message || "Authentication failed.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSaveProfile = async () => {
    const nextProfile = normalizeProfile(profile);
    saveProfile(nextProfile);

    if (!authToken) {
      setSavedProfile(nextProfile);
      setSyncStatus({
        state: "offline",
        message: "Profile saved on this device. Sign in to save it to your account.",
        updatedAt: "",
      });
      return;
    }

    setSavingProfile(true);
    try {
      const data = await saveStoredUserData(
        {
          progress: normalizeProgress(progress),
          profile: nextProfile,
          readingPlan: savedSettings,
        },
        authToken
      );
      const normalizedSavedProfile = normalizeProfile(data.profile);
      setSavedProfile(normalizedSavedProfile);
      setProfile(normalizedSavedProfile);
      setCurrentUser((prev) =>
        prev ? { ...prev, email: normalizedSavedProfile.email || prev.email } : prev
      );
      saveProfile(normalizedSavedProfile);
      setSyncStatus({
        state: "connected",
        message: "Profile saved to your account.",
        updatedAt: data.updatedAt || "",
      });
    } catch {
      setSyncStatus({
        state: "offline",
        message: "Could not save your profile to the backend.",
        updatedAt: "",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const persistReadingPlan = async (nextSettings, successMessage) => {
    saveSettings(nextSettings);

    if (!authToken) {
      setSavedSettings(nextSettings);
      setSyncStatus({
        state: "offline",
        message: "Reading plan saved on this device. Sign in to save it to your account.",
        updatedAt: "",
      });
      return nextSettings;
    }

    try {
      const data = await saveStoredUserData(
        {
          progress: normalizeProgress(progress),
          profile: savedProfile,
          readingPlan: nextSettings,
        },
        authToken
      );
      const normalizedSavedSettings = normalizeSettings(data.readingPlan);
      setSavedSettings(normalizedSavedSettings);
      saveSettings(normalizedSavedSettings);
      setSyncStatus({
        state: "connected",
        message: successMessage,
        updatedAt: data.updatedAt || "",
      });
      return normalizedSavedSettings;
    } catch {
      setSyncStatus({
        state: "offline",
        message: "Could not save your reading plan to the backend.",
        updatedAt: "",
      });
      return nextSettings;
    }
  };

  const handleSaveReadingPlan = async () => {
    setSavingPlan(true);
    try {
      await persistReadingPlan(settings, "Reading plan saved to your account.");
    } finally {
      setSavingPlan(false);
    }
  };

  const updateReaderFontSize = async (delta) => {
    const nextValue = Math.max(12, Math.min(24, readerFontSize + delta));
    if (nextValue === readerFontSize) return;

    const nextSettings = normalizeSettings({
      ...settings,
      readerFontSize: nextValue,
    });

    setReaderFontSize(nextValue);
    setSavedSettings(nextSettings);
    await persistReadingPlan(nextSettings, "Reader font size saved to your account.");
  };

  const decreaseReaderFontSize = () => {
    void updateReaderFontSize(-1);
  };

  const increaseReaderFontSize = () => {
    void updateReaderFontSize(1);
  };

  const handleChooseChapter = (bookName, chapterNumber) => {
    setActiveReference(`${bookName} ${chapterNumber}`);
    setChapterChooserBook(bookName);
    setShowChapterChooser(false);
  };

  useEffect(() => {
    if (activeBook?.name) {
      setChapterChooserBook(activeBook.name);
    }
  }, [activeBook]);

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
    <div className="min-h-screen bg-slate-50 p-2 lg:p-4 pb-28 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div
              className="flex items-center gap-2"
              title="Read your assigned chapter, watch your progress, and manage your plan in profile."
            >
              <BookOpen className="h-6 w-6 shrink-0 text-slate-900" />
              <h1 className="truncate text-3xl font-bold tracking-tight text-slate-900">
                Bible Circle
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <PrimaryButton
              type="button"
              variant={showTodaysReading ? "solid" : "outline"}
              onClick={() => setShowTodaysReading((value) => !value)}
              className="h-11 w-11 px-0"
              aria-label={showTodaysReading ? "Hide today's reading" : "Show today's reading"}
              title={showTodaysReading ? "Hide today's reading" : "Show today's reading"}
            >
              <ListChecks className="h-4 w-4" />
            </PrimaryButton>
            <PrimaryButton
              type="button"
              variant={showAdditionalReader ? "solid" : "outline"}
              onClick={() => setShowAdditionalReader((value) => !value)}
              className="h-11 w-11 px-0"
              aria-label={showAdditionalReader ? "Hide comparison pane" : "Show comparison pane"}
              title={showAdditionalReader ? "Hide comparison pane" : "Show comparison pane"}
            >
              <BookOpen className="h-4 w-4" />
            </PrimaryButton>
          </div>
        </div>

        {mainPage === "reader" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid gap-6 lg:grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-2 overflow-visible pb-1">
                      <button
                        type="button"
                        onClick={() => setShowChapterChooser((current) => !current)}
                        className="flex lg:w-96 min-w-44 shrink-0 items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 py-3 text-left text-sm text-slate-900 transition hover:border-slate-400"
                      >
                        <span className="truncate">{activeReference}</span>
                        <span className="ml-3 text-xs font-medium text-slate-500">
                          {showChapterChooser ? "Close" : "Choose"}
                        </span>
                      </button>
                      <PrimaryButton
                        variant="outline"
                        className="h-9 w-9 shrink-0 px-0"
                        onClick={() => goToAdjacentChapter("prev")}
                      >
                        &lt;
                      </PrimaryButton>
                      <PrimaryButton
                        variant="outline"
                        className="h-9 w-9 shrink-0 px-0"
                        onClick={() => goToAdjacentChapter("next")}
                      >
                        &gt;
                      </PrimaryButton>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowTranslationChooser((current) => !current)}
                          className="flex h-9 items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-900 transition hover:border-slate-400"
                          aria-label="Choose Bible version"
                          title={
                            translations.find((item) => item.id === translation)?.label ||
                            "Choose Bible version"
                          }
                        >
                          <BookOpen className="h-4 w-4 text-slate-500" />
                          <span>{translation.toUpperCase()}</span>
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        </button>

                        {showTranslationChooser ? (
                          <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                            <div className="space-y-1">
                              {translations.map((item) => {
                                const active = item.id === translation;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                      setTranslation(item.id);
                                      setShowTranslationChooser(false);
                                    }}
                                    className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                                      active
                                        ? "bg-slate-900 text-white"
                                        : "bg-white text-slate-700 hover:bg-slate-100"
                                    }`}
                                  >
                                    <span>{item.label}</span>
                                    <span
                                      className={`ml-3 text-xs font-semibold uppercase ${
                                        active ? "text-slate-200" : "text-slate-400"
                                      }`}
                                    >
                                      {item.id}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showChapterChooser ? (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Books
                          </p>
                          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                            {bibleBooks.map((book) => {
                              const active = chooserBook?.name === book.name;
                              return (
                                <div key={book.id} className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => setChapterChooserBook(book.name)}
                                    className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                                      active
                                        ? "bg-slate-900 text-white"
                                        : "bg-white text-slate-700 hover:bg-slate-100"
                                    }`}
                                  >
                                    <span>{book.name}</span>
                                    <span
                                      className={`text-xs ${active ? "text-slate-200" : "text-slate-400"}`}
                                    >
                                      {book.chapters}
                                    </span>
                                  </button>

                                  {active ? (
                                    <div className="rounded-2xl border border-slate-200 bg-white p-3 md:hidden">
                                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {book.name}
                                      </p>
                                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                                        {chooserBookChapters.map((chapter) => {
                                          const selected =
                                            activeReadState.book === chooserBook?.name &&
                                            activeReadState.chapter === chapter;
                                          return (
                                            <button
                                              key={`${chooserBook?.name}-${chapter}-mobile`}
                                              type="button"
                                              onClick={() =>
                                                handleChooseChapter(chooserBook.name, chapter)
                                              }
                                              className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                                                selected
                                                  ? "border-slate-900 bg-slate-900 text-white"
                                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                                              }`}
                                            >
                                              {chapter}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="hidden space-y-2 md:block">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {chooserBook?.name || "Chapters"}
                          </p>
                          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                            {chooserBookChapters.map((chapter) => {
                              const selected =
                                activeReadState.book === chooserBook?.name &&
                                activeReadState.chapter === chapter;
                              return (
                                <button
                                  key={`${chooserBook?.name}-${chapter}`}
                                  type="button"
                                  onClick={() => handleChooseChapter(chooserBook.name, chapter)}
                                  className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                                    selected
                                      ? "border-slate-900 bg-slate-900 text-white"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                                  }`}
                                >
                                  {chapter}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-3xl border border-slate-200 bg-white p-2 lg:mb-8 lg:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-900">{activeReference}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {chapterData.translationName || "Loading translation..."}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PrimaryButton
                          variant="outline"
                          className="px-3 py-2"
                          onClick={decreaseReaderFontSize}
                          aria-label="Decrease font size"
                        >
                          A-
                        </PrimaryButton>
                        <PrimaryButton
                          variant="outline"
                          className="px-3 py-2"
                          onClick={increaseReaderFontSize}
                          aria-label="Increase font size"
                        >
                          A+
                        </PrimaryButton>
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
                    </div>

                    <div className="mt-6 rounded-3xl bg-slate-50 p-2 lg:p-4">
                      <ChapterTextContent
                        loading={loadingChapter}
                        error={chapterError}
                        verses={chapterData.verses}
                        fontSize={readerFontSize}
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
                          fontSize={readerFontSize}
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
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="text-xl font-semibold text-slate-900">Book-by-book progress</div>
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
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {filteredBooks.map((book) => {
                    const readCount = progress[book.name].filter(Boolean).length;
                    const pct = Math.round((readCount / book.chapters) * 100);
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
                            {done ? <Badge active>Completed</Badge> : <Badge>{pct}%</Badge>}
                          </div>
                          <ProgressBar value={pct} />
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
                          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-10 xl:grid-cols-12">
                            {progress[book.name].map((isRead, index) => (
                              <div
                                key={`${book.name}-${index + 1}`}
                                className={`flex items-center gap-1.5 rounded-xl border px-1.5 py-1 text-xs transition hover:shadow-sm ${
                                  isRead
                                    ? "border-slate-300 bg-slate-100"
                                    : "border-slate-200 bg-white"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isRead}
                                  onChange={() => toggleChapter(book.name, index)}
                                  className="h-3.5 w-3.5 rounded border-slate-300"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveReference(`${book.name} ${index + 1}`);
                                    setMainPage("reader");
                                  }}
                                  className="min-w-0 text-left text-slate-700 transition hover:text-slate-900"
                                >
                                  {index + 1}
                                </button>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                    <ListChecks className="h-5 w-5" />
                    Daily plan
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDailyPlan((current) => !current)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    {showDailyPlan ? "Hide details" : "Show details"}
                  </button>
                </div>
              </CardHeader>
              {showDailyPlan ? (
                <CardContent className="space-y-3">
                  <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                    {dailyPlan.map((item) => {
                      const doneCount = item.chapters.filter(
                        (chapter) => progress[chapter.book][chapter.chapter - 1]
                      ).length;
                      const done = doneCount === item.chapters.length;
                      return (
                        <Card key={item.day} className="border-slate-200 shadow-none">
                          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
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
                </CardContent>
              ) : null}
            </Card>
          </motion.div>
        )}

        {mainPage === "profile" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <LoginCard
              Card={Card}
              CardHeader={CardHeader}
              CardContent={CardContent}
              TabButton={TabButton}
              TextInput={TextInput}
              PrimaryButton={PrimaryButton}
              authToken={authToken}
              authMode={authMode}
              setAuthMode={setAuthMode}
              handleAuthSubmit={handleAuthSubmit}
              authForm={authForm}
              handleAuthFieldChange={handleAuthFieldChange}
              authSubmitting={authSubmitting}
              authError={authError}
              currentUser={currentUser}
              profileEmail={profile.email}
              handleSignOut={handleSignOut}
            />

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                    <User className="h-5 w-5" />
                    User profile
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
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
                  <PrimaryButton onClick={handleSaveProfile} disabled={savingProfile}>
                    {savingProfile ? "Saving profile..." : "Save profile"}
                  </PrimaryButton>
                </CardContent>
              </Card>

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

                  <PrimaryButton onClick={handleSaveReadingPlan} disabled={savingPlan}>
                    {savingPlan ? "Saving plan..." : "Save reading plan"}
                  </PrimaryButton>
                </CardContent>
              </Card>

            </div>

            <Card>
              <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm text-slate-500">Backend sync</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">
                    {syncStatus.message}
                  </div>
                  {syncStatus.updatedAt ? (
                    <div className="mt-1 text-sm text-slate-500">
                      Last saved: {new Date(syncStatus.updatedAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
                <Badge active={syncStatus.state === "connected"}>
                  {syncStatus.state === "connected" ? "Connected" : "Offline"}
                </Badge>
              </CardContent>
            </Card>
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
