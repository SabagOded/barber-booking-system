export const demoSettings = {
  businessName: "שם העסק",
  providerName: "נותן השירות",
  phone: "0500000000",
  whatsappPhone: "972500000000",
  address: "רח׳ חיים ברלב 2, עפולה",
  calendarNote: "נתראה בקרוב. אם צריך לבטל, שלחו הודעה בוואטסאפ.",
  tagline: "",
  doorNotice: "",
  doorNoticeUntil: "",
  timezone: "Asia/Jerusalem",
  slotIntervalMinutes: 30,
  logoStorageKey: null,
  logoDisplaySize: "medium" as const,
};

export const demoWorkingHours = [
  { weekday: 0, isOpen: true, openTime: "09:00", closeTime: "19:00" },
  { weekday: 1, isOpen: true, openTime: "09:00", closeTime: "19:00" },
  { weekday: 2, isOpen: true, openTime: "09:00", closeTime: "19:00" },
  { weekday: 3, isOpen: true, openTime: "09:00", closeTime: "19:00" },
  { weekday: 4, isOpen: true, openTime: "09:00", closeTime: "19:00" },
  { weekday: 5, isOpen: true, openTime: "09:00", closeTime: "14:00" },
  { weekday: 6, isOpen: false, openTime: "00:00", closeTime: "00:00" },
];

export const demoServices = [
  { name: "תספורת ללא זקן", durationMinutes: 30, priceAgorot: 8000, sortOrder: 1 },
  { name: "תספורת עם זקן", durationMinutes: 45, priceAgorot: 11000, sortOrder: 2 },
  { name: "עיצוב זקן", durationMinutes: 20, priceAgorot: 5000, sortOrder: 3 },
];
