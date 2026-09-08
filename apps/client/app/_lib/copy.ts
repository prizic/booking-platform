import type { Locale } from "@wlbp/i18n";

export type ClientMessageKey =
  | "eyebrow"
  | "title"
  | "summary"
  | "stepDiscover"
  | "stepChoose"
  | "stepConfirm"
  | "status"
  | "timezone"
  | "primaryAction"
  | "secondaryAction"
  | "previewLabel"
  | "languageNavigation"
  | "languageEnglish"
  | "languageArabic"
  | "appointmentLabel"
  | "timezoneLabel"
  | "priceLabel"
  | "customerNameLabel"
  | "customerNameDescription"
  | "submitAction"
  | "errorSummaryTitle"
  | "nameRequired"
  | "successMessage"
  | "notFoundTitle"
  | "returnHome"
  | "availabilityTitle"
  | "availabilitySummary"
  | "availabilityDateLabel"
  | "availabilityTimeZoneLabel"
  | "availabilityPartySizeLabel"
  | "availabilitySearch"
  | "availabilitySearching"
  | "availabilityResults"
  | "availabilityEmpty"
  | "availabilityEmptyAction"
  | "availabilityErrorTitle"
  | "availabilityError"
  | "availabilityRetry"
  | "availabilityAdvisory"
  | "availabilityLocationTimeZone"
  | "availabilitySelect"
  | "availabilitySelected"
  | "availabilitySelectedAnnouncement"
  | "availabilityUnavailable"
  | "availabilityNoSlotsCapacity"
  | "availabilityNoSlotsMatching"
  | "availabilityNoSlotsWindow"
  | "availabilityNoSlotsPolicy"
  | "bookingTitle"
  | "bookingSummary"
  | "bookingStepSlot"
  | "bookingStepDetails"
  | "bookingStepConfirmed"
  | "bookingHoldExpires"
  | "bookingContinue"
  | "bookingHolding"
  | "bookingNameLabel"
  | "bookingNameDescription"
  | "bookingEmailLabel"
  | "bookingEmailDescription"
  | "bookingPhoneLabel"
  | "bookingPhoneDescription"
  | "bookingIntakeLegend"
  | "bookingConsentLabel"
  | "bookingConsentRequired"
  | "bookingNameRequired"
  | "bookingEmailRequired"
  | "bookingFieldRequired"
  | "bookingSubmit"
  | "bookingSubmitting"
  | "bookingErrorTitle"
  | "bookingErrorSlotUnavailable"
  | "bookingErrorPolicyDenied"
  | "bookingErrorRevisionConflict"
  | "bookingErrorPaymentPending"
  | "bookingErrorIdempotencyConflict"
  | "bookingErrorInvalidRequest"
  | "bookingErrorUnavailable"
  | "bookingRestart"
  | "bookingSuccessTitle"
  | "bookingSuccessSummary"
  | "bookingReferenceLabel"
  | "bookingWhenLabel"
  | "bookingServiceLabel"
  | "bookingLocationLabel"
  | "bookingTotalLabel"
  | "bookingStatusLabel"
  | "bookingStatusConfirmed"
  | "bookingNotificationQueued"
  | "bookingNextSteps"
  | "bookingConsentVersionLabel"
  | "bookingReviewTitle"
  | "bookingRequestedTitle"
  | "bookingRequestedSummary"
  | "bookingRequestedStatus"
  | "bookingDecisionDueLabel"
  | "bookingRequestedNextSteps"
  | "proposalTitle"
  | "proposalSummary"
  | "proposalCurrentLabel"
  | "proposalProposedLabel"
  | "proposalAccept"
  | "proposalDecline"
  | "proposalAccepting"
  | "proposalDeclining"
  | "proposalAcceptedTitle"
  | "proposalAcceptedSummary"
  | "proposalDeclinedTitle"
  | "proposalDeclinedSummary"
  | "proposalErrorTitle"
  | "proposalErrorExpired"
  | "proposalErrorUnavailable"
  | "proposalMissingToken";

export const clientCopy: Record<Locale, Record<ClientMessageKey, string>> = {
  en: {
    eyebrow: "Public booking experience",
    title: "Book the right time, without the back-and-forth.",
    summary: "A calm, accessible path from service discovery to a confirmed booking.",
    stepDiscover: "Discover a service",
    stepChoose: "Choose a valid time",
    stepConfirm: "Review and confirm",
    status: "Booking client shell ready",
    timezone: "Times are shown in Asia/Riyadh",
    primaryAction: "Explore services",
    secondaryAction: "Manage a booking",
    previewLabel: "Booking journey preview",
    languageNavigation: "Language",
    languageEnglish: "English",
    languageArabic: "Arabic",
    appointmentLabel: "Selected appointment",
    timezoneLabel: "Time zone",
    priceLabel: "Total",
    customerNameLabel: "Your name",
    customerNameDescription: "Used to identify this booking preview.",
    submitAction: "Review booking",
    errorSummaryTitle: "We could not review your booking",
    nameRequired: "Enter your name to continue.",
    successMessage: "Booking preview ready for {name}.",
    notFoundTitle: "Page not found",
    returnHome: "Return to booking",
    availabilityTitle: "Find an available time",
    availabilitySummary: "Search a seven-day window in the timezone you prefer.",
    availabilityDateLabel: "Starting date",
    availabilityTimeZoneLabel: "Your timezone",
    availabilityPartySizeLabel: "Guests",
    availabilitySearch: "Find times",
    availabilitySearching: "Finding available times",
    availabilityResults: "Available times",
    availabilityEmpty: "No times matched this search.",
    availabilityEmptyAction: "Try another date or timezone.",
    availabilityErrorTitle: "We could not load available times",
    availabilityError:
      "Availability is temporarily unavailable. Your booking has not changed.",
    availabilityRetry: "Try again",
    availabilityAdvisory: "Times can change until your booking is confirmed.",
    availabilityLocationTimeZone: "Service timezone",
    availabilitySelect: "Select",
    availabilitySelected: "Selected",
    availabilitySelectedAnnouncement:
      "Selected {time}. Availability will be checked again before confirmation.",
    availabilityUnavailable: "Choose a published service before searching for a time.",
    availabilityNoSlotsCapacity: "Those times no longer have enough capacity.",
    availabilityNoSlotsMatching: "No bookable times match this search.",
    availabilityNoSlotsWindow: "These dates are outside the booking window.",
    availabilityNoSlotsPolicy: "The current booking policy does not allow these times.",
    bookingTitle: "Book an appointment",
    bookingSummary:
      "Choose a time, share how to reach you, and confirm. Nothing is charged.",
    bookingStepSlot: "1. Choose a time",
    bookingStepDetails: "2. Your details",
    bookingStepConfirmed: "3. Confirmed",
    bookingHoldExpires: "This time is held for you until {time}.",
    bookingContinue: "Hold this time",
    bookingHolding: "Holding your time",
    bookingNameLabel: "Full name",
    bookingNameDescription: "Used to identify you at the appointment.",
    bookingEmailLabel: "Email",
    bookingEmailDescription: "Your confirmation is sent here.",
    bookingPhoneLabel: "Phone (optional)",
    bookingPhoneDescription: "Only used if we need to reach you about this booking.",
    bookingIntakeLegend: "Before your appointment",
    bookingConsentLabel: "I accept the booking and cancellation policy.",
    bookingConsentRequired: "Accept the policy to confirm your booking.",
    bookingNameRequired: "Enter your full name.",
    bookingEmailRequired: "Enter an email address we can send your confirmation to.",
    bookingFieldRequired: "This answer is required.",
    bookingSubmit: "Confirm booking",
    bookingSubmitting: "Confirming your booking",
    bookingErrorTitle: "We could not confirm your booking",
    bookingErrorSlotUnavailable:
      "That time was taken while you were filling in your details. Your answers are kept — choose another time.",
    bookingErrorPolicyDenied: "The current booking policy does not allow this booking.",
    bookingErrorRevisionConflict:
      "This service changed while you were booking. Choose a time again to see the current details.",
    bookingErrorPaymentPending:
      "This service now needs payment, which is not available yet.",
    bookingErrorIdempotencyConflict:
      "Your details changed after you submitted. Start again to confirm the new details.",
    bookingErrorInvalidRequest: "Check the highlighted answers and try again.",
    bookingErrorUnavailable:
      "Booking is temporarily unavailable. Nothing was booked or charged.",
    bookingRestart: "Choose another time",
    bookingSuccessTitle: "Your booking is confirmed",
    bookingSuccessSummary:
      "Keep your reference — you will need it to change or cancel this booking.",
    bookingReferenceLabel: "Booking reference",
    bookingWhenLabel: "When",
    bookingServiceLabel: "Service",
    bookingLocationLabel: "Location",
    bookingTotalLabel: "Total",
    bookingStatusLabel: "Status",
    bookingStatusConfirmed: "Confirmed — no payment needed",
    bookingNotificationQueued:
      "Your confirmation email is on its way. Your booking is confirmed even if it is delayed.",
    bookingNextSteps: "Arrive a few minutes early and bring your reference.",
    bookingConsentVersionLabel: "Policy version",
    bookingReviewTitle: "Review your booking",
    bookingRequestedTitle: "Your request has been sent",
    bookingRequestedSummary:
      "This service is confirmed by the team, so your time is not booked yet. Keep your reference — you will need it to follow up.",
    bookingRequestedStatus: "Awaiting approval — nothing has been charged",
    bookingDecisionDueLabel: "Decision due by",
    bookingRequestedNextSteps:
      "We will email you when the team accepts, suggests another time, or declines. If we do not answer by the date above, your request closes and you can request another time.",
    proposalTitle: "A new time has been suggested",
    proposalSummary:
      "Your original request is still open. Accepting the new time confirms your booking; declining keeps your request as it was.",
    proposalCurrentLabel: "You requested",
    proposalProposedLabel: "Suggested instead",
    proposalAccept: "Accept the new time",
    proposalDecline: "Keep my original request",
    proposalAccepting: "Confirming the new time",
    proposalDeclining: "Keeping your request",
    proposalAcceptedTitle: "Your booking is confirmed",
    proposalAcceptedSummary: "The new time is booked. Your reference has not changed.",
    proposalDeclinedTitle: "Your original request is still open",
    proposalDeclinedSummary: "We let the team know the suggested time does not work.",
    proposalErrorTitle: "We could not use this link",
    proposalErrorExpired:
      "This suggestion is no longer available. Check your email for the latest update on your request.",
    proposalErrorUnavailable:
      "This is temporarily unavailable. Your request has not changed.",
    proposalMissingToken: "Open the link from your email to see the suggested time.",
  },
  ar: {
    eyebrow: "تجربة الحجز العامة",
    title: "احجز الموعد المناسب دون مراسلات متكررة.",
    summary: "مسار هادئ وميسّر يبدأ باكتشاف الخدمة وينتهي بحجز مؤكّد.",
    stepDiscover: "اكتشف خدمة",
    stepChoose: "اختر وقتًا متاحًا",
    stepConfirm: "راجع وأكّد",
    status: "واجهة تطبيق الحجز جاهزة",
    timezone: "تُعرض الأوقات حسب توقيت آسيا/الرياض",
    primaryAction: "استكشف الخدمات",
    secondaryAction: "إدارة حجز",
    previewLabel: "معاينة رحلة الحجز",
    languageNavigation: "اللغة",
    languageEnglish: "الإنجليزية",
    languageArabic: "العربية",
    appointmentLabel: "الموعد المحدد",
    timezoneLabel: "المنطقة الزمنية",
    priceLabel: "الإجمالي",
    customerNameLabel: "اسمك",
    customerNameDescription: "يُستخدم للتعرّف على معاينة هذا الحجز.",
    submitAction: "مراجعة الحجز",
    errorSummaryTitle: "تعذّرت مراجعة حجزك",
    nameRequired: "أدخل اسمك للمتابعة.",
    successMessage: "معاينة الحجز جاهزة باسم {name}.",
    notFoundTitle: "الصفحة غير موجودة",
    returnHome: "العودة إلى الحجز",
    availabilityTitle: "ابحث عن وقت متاح",
    availabilitySummary: "ابحث ضمن سبعة أيام بالمنطقة الزمنية التي تفضلها.",
    availabilityDateLabel: "تاريخ البدء",
    availabilityTimeZoneLabel: "منطقتك الزمنية",
    availabilityPartySizeLabel: "عدد الضيوف",
    availabilitySearch: "البحث عن أوقات",
    availabilitySearching: "جارٍ البحث عن الأوقات المتاحة",
    availabilityResults: "الأوقات المتاحة",
    availabilityEmpty: "لا توجد أوقات مطابقة لهذا البحث.",
    availabilityEmptyAction: "جرّب تاريخًا أو منطقة زمنية أخرى.",
    availabilityErrorTitle: "تعذر تحميل الأوقات المتاحة",
    availabilityError: "التوافر غير متاح مؤقتًا. لم يتغير حجزك.",
    availabilityRetry: "إعادة المحاولة",
    availabilityAdvisory: "قد تتغير الأوقات حتى يتم تأكيد حجزك.",
    availabilityLocationTimeZone: "المنطقة الزمنية للخدمة",
    availabilitySelect: "اختيار",
    availabilitySelected: "تم الاختيار",
    availabilitySelectedAnnouncement:
      "تم اختيار {time}. سيُتحقق من التوافر مرة أخرى قبل التأكيد.",
    availabilityUnavailable: "اختر خدمة منشورة قبل البحث عن وقت.",
    availabilityNoSlotsCapacity: "لم تعد السعة كافية في هذه الأوقات.",
    availabilityNoSlotsMatching: "لا توجد أوقات قابلة للحجز تطابق هذا البحث.",
    availabilityNoSlotsWindow: "تقع هذه التواريخ خارج نافذة الحجز.",
    availabilityNoSlotsPolicy: "لا تسمح سياسة الحجز الحالية بهذه الأوقات.",
    bookingTitle: "احجز موعدًا",
    bookingSummary: "اختر وقتًا، وشاركنا وسيلة التواصل معك، ثم أكّد. لا توجد أي رسوم.",
    bookingStepSlot: "١. اختر وقتًا",
    bookingStepDetails: "٢. بياناتك",
    bookingStepConfirmed: "٣. تم التأكيد",
    bookingHoldExpires: "هذا الوقت محجوز لك حتى {time}.",
    bookingContinue: "احجز هذا الوقت مؤقتًا",
    bookingHolding: "جارٍ حجز وقتك",
    bookingNameLabel: "الاسم الكامل",
    bookingNameDescription: "يُستخدم للتعرّف عليك عند الموعد.",
    bookingEmailLabel: "البريد الإلكتروني",
    bookingEmailDescription: "سيصلك تأكيد الحجز على هذا البريد.",
    bookingPhoneLabel: "الهاتف (اختياري)",
    bookingPhoneDescription: "يُستخدم فقط إذا احتجنا للتواصل معك بشأن هذا الحجز.",
    bookingIntakeLegend: "قبل موعدك",
    bookingConsentLabel: "أوافق على سياسة الحجز والإلغاء.",
    bookingConsentRequired: "وافق على السياسة لتأكيد حجزك.",
    bookingNameRequired: "أدخل اسمك الكامل.",
    bookingEmailRequired: "أدخل بريدًا إلكترونيًا لإرسال التأكيد إليه.",
    bookingFieldRequired: "هذه الإجابة مطلوبة.",
    bookingSubmit: "تأكيد الحجز",
    bookingSubmitting: "جارٍ تأكيد حجزك",
    bookingErrorTitle: "تعذّر تأكيد حجزك",
    bookingErrorSlotUnavailable:
      "تم حجز هذا الوقت أثناء إدخال بياناتك. تم الاحتفاظ بإجاباتك — اختر وقتًا آخر.",
    bookingErrorPolicyDenied: "لا تسمح سياسة الحجز الحالية بهذا الحجز.",
    bookingErrorRevisionConflict:
      "تغيّرت هذه الخدمة أثناء الحجز. اختر وقتًا من جديد لعرض التفاصيل الحالية.",
    bookingErrorPaymentPending: "أصبحت هذه الخدمة تتطلب الدفع، وهو غير متاح بعد.",
    bookingErrorIdempotencyConflict:
      "تغيّرت بياناتك بعد الإرسال. ابدأ من جديد لتأكيد البيانات الجديدة.",
    bookingErrorInvalidRequest: "راجع الإجابات المحددة ثم أعد المحاولة.",
    bookingErrorUnavailable:
      "الحجز غير متاح مؤقتًا. لم يتم إنشاء أي حجز ولم تُفرض أي رسوم.",
    bookingRestart: "اختر وقتًا آخر",
    bookingSuccessTitle: "تم تأكيد حجزك",
    bookingSuccessSummary: "احتفظ برقم المرجع — ستحتاجه لتعديل هذا الحجز أو إلغائه.",
    bookingReferenceLabel: "رقم مرجع الحجز",
    bookingWhenLabel: "الموعد",
    bookingServiceLabel: "الخدمة",
    bookingLocationLabel: "الموقع",
    bookingTotalLabel: "الإجمالي",
    bookingStatusLabel: "الحالة",
    bookingStatusConfirmed: "مؤكّد — لا حاجة للدفع",
    bookingNotificationQueued:
      "رسالة التأكيد في طريقها إليك. حجزك مؤكد حتى إن تأخرت الرسالة.",
    bookingNextSteps: "احضر قبل الموعد بدقائق ومعك رقم المرجع.",
    bookingConsentVersionLabel: "إصدار السياسة",
    bookingReviewTitle: "راجع حجزك",
    bookingRequestedTitle: "تم إرسال طلبك",
    bookingRequestedSummary:
      "يؤكّد الفريق هذه الخدمة، لذا لم يُحجز وقتك بعد. احتفظ برقم المرجع لمتابعة الطلب.",
    bookingRequestedStatus: "بانتظار الموافقة — لم تُفرض أي رسوم",
    bookingDecisionDueLabel: "موعد الرد",
    bookingRequestedNextSteps:
      "سنراسلك عبر البريد عند قبول الفريق للطلب أو اقتراح وقت آخر أو رفضه. وإذا لم نردّ قبل التاريخ أعلاه، يُغلق طلبك ويمكنك طلب وقت آخر.",
    proposalTitle: "تم اقتراح وقت جديد",
    proposalSummary:
      "طلبك الأصلي ما زال قائمًا. قبول الوقت الجديد يؤكّد حجزك، ورفضه يبقي طلبك كما هو.",
    proposalCurrentLabel: "الوقت الذي طلبته",
    proposalProposedLabel: "الوقت المقترح",
    proposalAccept: "قبول الوقت الجديد",
    proposalDecline: "الإبقاء على طلبي الأصلي",
    proposalAccepting: "جارٍ تأكيد الوقت الجديد",
    proposalDeclining: "جارٍ الإبقاء على طلبك",
    proposalAcceptedTitle: "تم تأكيد حجزك",
    proposalAcceptedSummary: "تم حجز الوقت الجديد، ولم يتغيّر رقم المرجع.",
    proposalDeclinedTitle: "طلبك الأصلي ما زال قائمًا",
    proposalDeclinedSummary: "أبلغنا الفريق بأن الوقت المقترح غير مناسب.",
    proposalErrorTitle: "تعذّر استخدام هذا الرابط",
    proposalErrorExpired:
      "لم يعد هذا الاقتراح متاحًا. راجع بريدك لمعرفة آخر تحديث لطلبك.",
    proposalErrorUnavailable: "الخدمة غير متاحة مؤقتًا، ولم يتغيّر طلبك.",
    proposalMissingToken: "افتح الرابط من بريدك الإلكتروني لعرض الوقت المقترح.",
  },
};

export function getClientMessage(locale: Locale, key: ClientMessageKey) {
  return clientCopy[locale][key];
}

/** Availability picker copy, shared by the home page preview and /book. */
export function availabilityPickerCopy(locale: Locale) {
  const message = (key: ClientMessageKey) => getClientMessage(locale, key);
  return {
    advisory: message("availabilityAdvisory"),
    dateLabel: message("availabilityDateLabel"),
    empty: message("availabilityEmpty"),
    emptyAction: message("availabilityEmptyAction"),
    error: message("availabilityError"),
    errorTitle: message("availabilityErrorTitle"),
    locationTimeZone: message("availabilityLocationTimeZone"),
    noSlotReasons: {
      capacity_unavailable: message("availabilityNoSlotsCapacity"),
      no_matching_availability: message("availabilityNoSlotsMatching"),
      outside_booking_window: message("availabilityNoSlotsWindow"),
      policy_restricted: message("availabilityNoSlotsPolicy"),
    },
    partySizeLabel: message("availabilityPartySizeLabel"),
    results: message("availabilityResults"),
    retry: message("availabilityRetry"),
    search: message("availabilitySearch"),
    searching: message("availabilitySearching"),
    select: message("availabilitySelect"),
    selected: message("availabilitySelected"),
    selectedAnnouncement: message("availabilitySelectedAnnouncement"),
    summary: message("availabilitySummary"),
    timeZoneLabel: message("availabilityTimeZoneLabel"),
    title: message("availabilityTitle"),
    unavailable: message("availabilityUnavailable"),
  };
}

/** Every booking-journey string for one locale, keyed as the flow reads them. */
export function bookingFlowCopy(locale: Locale): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(clientCopy[locale]).filter(
        ([key]) => key.startsWith("booking") || key.startsWith("proposal"),
      ),
    ),
  );
}
