import type { Locale } from "@wlbp/i18n";

export type DashboardMessageKey =
  | "todayTitle"
  | "todayIntro"
  | "todayUnavailable"
  | "todayEmpty"
  | "todayNowLabel"
  | "todayQueueArrivals"
  | "todayQueueRequests"
  | "todayQueuePayments"
  | "todayQueueExceptions"
  | "todayQueueCancellations"
  | "todayQueueUpcoming"
  | "todayCountLabel"
  | "calendarTitle"
  | "calendarSummary"
  | "calendarUnavailable"
  | "calendarEmpty"
  | "calendarViewLabel"
  | "calendarViewDay"
  | "calendarViewWeek"
  | "calendarViewResource"
  | "calendarViewList"
  | "calendarFilterLocation"
  | "calendarFilterStaff"
  | "calendarFilterService"
  | "calendarFilterApply"
  | "calendarFilterAll"
  | "calendarDateLabel"
  | "calendarTimezoneNote"
  | "calendarResourceUnassigned"
  | "calendarStatusLabel"
  | "calendarOpenBooking"
  | "calendarListAlternative"
  | "bookingsDeliveryLabel"
  | "bookingsResend"
  | "bookingsResending"
  | "bookingsResultResent"
  | "bookingsResendUnavailable"
  | "bookingsTitle"
  | "bookingsSummary"
  | "bookingsEmpty"
  | "bookingsUnavailable"
  | "bookingsListLabel"
  | "bookingsWhenLabel"
  | "bookingsStatusLabel"
  | "bookingsCancel"
  | "bookingsCancelling"
  | "bookingsReschedule"
  | "bookingsNewTimeLabel"
  | "bookingsResultCancelled"
  | "bookingsResultMoved"
  | "requestsTitle"
  | "requestsSummary"
  | "requestsEmpty"
  | "requestsUnavailable"
  | "requestsQueueLabel"
  | "requestsRequestedAtLabel"
  | "requestsDeadlineLabel"
  | "requestsCustomerLabel"
  | "requestsCustomerHidden"
  | "requestsIntakeLabel"
  | "requestsIntakePresent"
  | "requestsIntakeAbsent"
  | "requestsProposalLabel"
  | "requestsAccept"
  | "requestsReject"
  | "requestsPropose"
  | "requestsProposeTimeLabel"
  | "requestsPublicReasonLabel"
  | "requestsPublicReasonHint"
  | "requestsInternalReasonLabel"
  | "requestsInternalReasonHint"
  | "requestsResultAccepted"
  | "requestsResultRejected"
  | "requestsResultProposed"
  | "requestsResultConflict"
  | "requestsResultUnavailable"
  | "requestsResultInvalid"
  | "requestsResultNotAuthorized"
  | "requestsResultSlotUnavailable"
  | "requestsProposalLinkLabel"
  | "requestsProposalLinkHint"
  | "requestsPriceLabel"
  | "navRequests"
  | "eyebrow"
  | "title"
  | "summary"
  | "status"
  | "navToday"
  | "navCalendar"
  | "navBookings"
  | "navCustomers"
  | "navTeamResources"
  | "navBrand"
  | "metricArrivals"
  | "metricRequests"
  | "metricPayments"
  | "scheduleTitle"
  | "scheduleEmpty"
  | "listAlternative"
  | "openCalendar"
  | "gridView"
  | "listView"
  | "viewSelector"
  | "viewChangedGrid"
  | "viewChangedList"
  | "timeZoneLabel"
  | "scheduleConsultation"
  | "scheduleFollowUp"
  | "statusConfirmed"
  | "statusRequested"
  | "primaryNavigation"
  | "languageNavigation"
  | "languageEnglish"
  | "languageArabic"
  | "brandLabel"
  | "todaySummary"
  | "notFoundTitle"
  | "returnHome"
  | "privateStatus"
  | "configurationTitle"
  | "configurationSummary"
  | "signInTitle"
  | "signInSummary"
  | "deniedTitle"
  | "deniedSummary"
  | "selectionTitle"
  | "selectionSummary"
  | "selectTenant"
  | "workspaceTitle"
  | "tenantLabel"
  | "roleLabel"
  | "locationsLabel"
  | "capabilitiesLabel"
  | "mfaVerified"
  | "mfaNotVerified"
  | "navAvailability"
  | "availabilityTitle"
  | "availabilitySummary"
  | "scheduleEditorTitle"
  | "scheduleDayLabel"
  | "scheduleStartLabel"
  | "scheduleEndLabel"
  | "scheduleSave"
  | "scheduleSaved"
  | "scheduleSaveError"
  | "scheduleUnavailable"
  | "scheduleOperationLabel"
  | "scheduleScopeOption"
  | "scheduleWeeklyOption"
  | "scheduleBreakOption"
  | "scheduleExceptionOption"
  | "scheduleTimeOffOption"
  | "scheduleHolidayOption"
  | "scheduleBlackoutOption"
  | "scheduleMaintenanceOption"
  | "schedulePolicyOption"
  | "scheduleScopeLabel"
  | "scheduleNewScopeOption"
  | "scheduleScopeKindLabel"
  | "scheduleLocationOption"
  | "scheduleStaffOption"
  | "scheduleResourceOption"
  | "scheduleLocationIdLabel"
  | "scheduleStaffIdLabel"
  | "scheduleResourceIdLabel"
  | "scheduleServiceIdLabel"
  | "scheduleDateLabel"
  | "scheduleExceptionKindLabel"
  | "scheduleClosedOption"
  | "scheduleOverrideOption"
  | "scheduleStartsAtLabel"
  | "scheduleEndsAtLabel"
  | "scheduleNameLabel"
  | "scheduleReasonLabel"
  | "schedulePolicyKeyLabel"
  | "schedulePolicyValueLabel"
  | "availabilityPreviewTitle"
  | "availabilityPreviewSummary"
  | "availabilityWindowStartLabel"
  | "availabilityWindowEndLabel"
  | "availabilityPartySizeLabel"
  | "availabilityStaffPreferenceLabel"
  | "availabilityPreviewAction"
  | "availabilityAdvisory"
  | "availabilityNoSlots"
  | "availabilityNoSlotsCapacity"
  | "availabilityNoSlotsPolicy"
  | "availabilityNoSlotsWindow"
  | "availabilityPreviewError"
  | "availabilityLocationTimeZone"
  | "availabilityCustomerTimeZone";

export const dashboardCopy: Record<Locale, Record<DashboardMessageKey, string>> = {
  en: {
    todayTitle: "Today",
    todayIntro: "Everything waiting on someone, in the order it needs attention.",
    todayUnavailable: "Today stays closed until the secure connection is complete.",
    todayEmpty: "Nothing is waiting on you right now.",
    todayNowLabel: "Current time",
    todayQueueArrivals: "Arriving today",
    todayQueueRequests: "Requests awaiting a decision",
    todayQueuePayments: "Payments needing action",
    todayQueueExceptions: "Delivery problems",
    todayQueueCancellations: "Recently cancelled",
    todayQueueUpcoming: "Later",
    todayCountLabel: "items",
    calendarTitle: "Calendar",
    calendarSummary:
      "The same bookings by day, by week, by resource, or as a list. Every action recheckes policy on the server.",
    calendarUnavailable:
      "The calendar stays closed until the secure connection is complete.",
    calendarEmpty: "No bookings in this range.",
    calendarViewLabel: "View",
    calendarViewDay: "Day",
    calendarViewWeek: "Week",
    calendarViewResource: "By staff",
    calendarViewList: "List",
    calendarFilterLocation: "Location",
    calendarFilterStaff: "Staff",
    calendarFilterService: "Service",
    calendarFilterApply: "Apply",
    calendarFilterAll: "All",
    calendarDateLabel: "Starting date",
    calendarTimezoneNote: "Times are shown in the location timezone.",
    calendarResourceUnassigned: "Unassigned",
    calendarStatusLabel: "Status",
    calendarOpenBooking: "Open in bookings",
    calendarListAlternative:
      "This list carries the same bookings as the day and week views.",
    bookingsDeliveryLabel: "Email",
    bookingsResend: "Send the email again",
    bookingsResending: "Sending again",
    bookingsResultResent: "The email is queued to send again.",
    bookingsResendUnavailable: "That email cannot be sent again.",
    bookingsTitle: "Upcoming bookings",
    bookingsSummary:
      "Move or cancel a booking. The customer is told either way, and any refund follows the policy the booking was made under.",
    bookingsEmpty: "No upcoming bookings.",
    bookingsUnavailable:
      "Bookings stay closed until the secure connection is complete.",
    bookingsListLabel: "Upcoming bookings",
    bookingsWhenLabel: "When",
    bookingsStatusLabel: "Status",
    bookingsCancel: "Cancel booking",
    bookingsCancelling: "Cancelling",
    bookingsReschedule: "Move booking",
    bookingsNewTimeLabel: "New time",
    bookingsResultCancelled: "The booking is cancelled and the customer will be told.",
    bookingsResultMoved: "The booking has been moved and the customer will be told.",
    requestsTitle: "Booking requests",
    requestsSummary:
      "Requests wait for a decision here. Accepting books the time; the customer is told either way.",
    requestsEmpty: "No requests are waiting for a decision.",
    requestsUnavailable:
      "Requests stay closed until the secure connection is complete.",
    requestsQueueLabel: "Requests awaiting a decision",
    requestsRequestedAtLabel: "Requested",
    requestsDeadlineLabel: "Decide by",
    requestsCustomerLabel: "Customer",
    requestsCustomerHidden: "Hidden for your role",
    requestsIntakeLabel: "Intake answers",
    requestsIntakePresent: "Provided",
    requestsIntakeAbsent: "None",
    requestsProposalLabel: "Suggested time awaiting the customer",
    requestsAccept: "Accept",
    requestsReject: "Reject",
    requestsPropose: "Suggest another time",
    requestsProposeTimeLabel: "Suggested time",
    requestsPublicReasonLabel: "Message to the customer",
    requestsPublicReasonHint: "Shown to the customer. Keep it short and factual.",
    requestsInternalReasonLabel: "Internal note",
    requestsInternalReasonHint:
      "Kept in the booking history and never shown to the customer.",
    requestsResultAccepted: "The request is accepted and the time is booked.",
    requestsResultRejected: "The request is rejected and the customer will be told.",
    requestsResultProposed: "Your suggestion was sent to the customer.",
    requestsResultConflict:
      "Someone else decided this request first, or its deadline passed. The list has been refreshed.",
    requestsResultUnavailable:
      "That decision is temporarily unavailable. Nothing changed.",
    requestsResultInvalid: "Check the highlighted fields and try again.",
    requestsResultNotAuthorized: "Your role cannot decide this request.",
    requestsResultSlotUnavailable:
      "That time is no longer free, so the request was not accepted.",
    requestsProposalLinkLabel: "Customer link",
    requestsProposalLinkHint:
      "Send this link to the customer. It is shown once and works only for this suggestion.",
    requestsPriceLabel: "Total",
    navRequests: "Requests",
    eyebrow: "Tenant staff workspace",
    title: "Today stays clear, even when the schedule is full.",
    summary:
      "One operational view for arrivals, booking requests, payments, and exceptions.",
    status: "Dashboard shell ready",
    navToday: "Today",
    navCalendar: "Calendar",
    navBookings: "Bookings",
    navCustomers: "Customers",
    navTeamResources: "Team & resources",
    navBrand: "Brand & site",
    metricArrivals: "Today's arrivals",
    metricRequests: "Pending requests",
    metricPayments: "Payments needing action",
    scheduleTitle: "Next in the day",
    scheduleEmpty: "No live tenant data is connected in this foundation build.",
    listAlternative: "Accessible schedule list",
    openCalendar: "Open calendar",
    gridView: "Grid view",
    listView: "List view",
    viewSelector: "Schedule view",
    viewChangedGrid: "Schedule shown as a compact grid.",
    viewChangedList: "Schedule shown as an accessible list.",
    timeZoneLabel: "Time zone",
    scheduleConsultation: "Initial consultation · Layla Hassan",
    scheduleFollowUp: "Follow-up · Omar Kareem",
    statusConfirmed: "Confirmed",
    statusRequested: "Requested",
    primaryNavigation: "Primary navigation",
    languageNavigation: "Language",
    languageEnglish: "English",
    languageArabic: "Arabic",
    brandLabel: "Nawa operations",
    todaySummary: "Today summary",
    notFoundTitle: "Workspace not found",
    returnHome: "Return to the workspace",
    privateStatus: "Private tenant view",
    configurationTitle: "Workspace configuration unavailable",
    configurationSummary:
      "This private workspace is closed until its secure connection is configured.",
    signInTitle: "Sign in required",
    signInSummary: "Sign in to verify your current tenant membership.",
    deniedTitle: "Access unavailable",
    deniedSummary:
      "We could not verify this workspace, hostname, and membership together. No tenant data was shown.",
    selectionTitle: "Choose a workspace",
    selectionSummary:
      "Your account belongs to more than one tenant. Choose the workspace you want to enter.",
    selectTenant: "Open workspace",
    workspaceTitle: "Verified workspace context",
    tenantLabel: "Tenant",
    roleLabel: "Current role",
    locationsLabel: "Permitted locations",
    capabilitiesLabel: "Current capabilities",
    mfaVerified: "MFA assurance verified",
    mfaNotVerified: "MFA step-up not active",
    navAvailability: "Availability",
    availabilityTitle: "Working schedules",
    availabilitySummary:
      "Configure weekly hours, breaks, closures, and bounded booking rules in your location timezone.",
    scheduleEditorTitle: "Add a weekly working interval",
    scheduleDayLabel: "Day of week (0 Sunday – 6 Saturday)",
    scheduleStartLabel: "Start minute",
    scheduleEndLabel: "End minute",
    scheduleSave: "Save schedule",
    scheduleSaved: "Schedule saved.",
    scheduleSaveError:
      "The schedule could not be saved. Check the values or reload for a newer revision.",
    scheduleUnavailable:
      "Schedule editing is unavailable until a verified tenant workspace is selected.",
    scheduleOperationLabel: "Configuration type",
    scheduleScopeOption: "Schedule scope",
    scheduleWeeklyOption: "Weekly hours",
    scheduleBreakOption: "Break",
    scheduleExceptionOption: "Date exception",
    scheduleTimeOffOption: "Staff or resource time off",
    scheduleHolidayOption: "Holiday",
    scheduleBlackoutOption: "Location blackout",
    scheduleMaintenanceOption: "Resource maintenance",
    schedulePolicyOption: "Policy override",
    scheduleScopeLabel: "Existing scope",
    scheduleNewScopeOption: "New scope",
    scheduleScopeKindLabel: "Scope kind",
    scheduleLocationOption: "Location",
    scheduleStaffOption: "Staff",
    scheduleResourceOption: "Resource",
    scheduleLocationIdLabel: "Location ID",
    scheduleStaffIdLabel: "Staff ID",
    scheduleResourceIdLabel: "Resource ID",
    scheduleServiceIdLabel: "Service ID",
    scheduleDateLabel: "Local date",
    scheduleExceptionKindLabel: "Exception kind",
    scheduleClosedOption: "Closed",
    scheduleOverrideOption: "Override hours",
    scheduleStartsAtLabel: "Starts at (UTC instant)",
    scheduleEndsAtLabel: "Ends at (UTC instant)",
    scheduleNameLabel: "Holiday name",
    scheduleReasonLabel: "Internal reason",
    schedulePolicyKeyLabel: "Policy key",
    schedulePolicyValueLabel: "Policy value",
    availabilityPreviewTitle: "Preview bookable times",
    availabilityPreviewSummary:
      "Use the same advisory slot rules as the public booking site.",
    availabilityWindowStartLabel: "Window starts (UTC)",
    availabilityWindowEndLabel: "Window ends (UTC)",
    availabilityPartySizeLabel: "Party size",
    availabilityStaffPreferenceLabel: "Preferred staff ID (optional)",
    availabilityPreviewAction: "Check availability",
    availabilityAdvisory:
      "These times are advisory. Booking confirmation always checks availability again.",
    availabilityNoSlots: "No bookable times match this window. Try other dates.",
    availabilityNoSlotsCapacity:
      "Capacity is unavailable in this window. Try another time or location.",
    availabilityNoSlotsPolicy:
      "Booking rules restrict this window. Try different dates or staff.",
    availabilityNoSlotsWindow:
      "This window is outside the booking notice or horizon. Choose later dates.",
    availabilityPreviewError:
      "Availability could not be checked. Verify the filters and try again.",
    availabilityLocationTimeZone: "Location timezone",
    availabilityCustomerTimeZone: "Customer timezone",
  },
  ar: {
    todayTitle: "اليوم",
    todayIntro: "كل ما ينتظر إجراءً، بالترتيب الذي يحتاج الانتباه فيه.",
    todayUnavailable: "تبقى صفحة اليوم مغلقة حتى يكتمل الاتصال الآمن.",
    todayEmpty: "لا شيء ينتظر إجراءً منك الآن.",
    todayNowLabel: "الوقت الحالي",
    todayQueueArrivals: "الوصول اليوم",
    todayQueueRequests: "طلبات تنتظر قرارًا",
    todayQueuePayments: "مدفوعات تحتاج إجراءً",
    todayQueueExceptions: "مشكلات في الإرسال",
    todayQueueCancellations: "ملغاة مؤخرًا",
    todayQueueUpcoming: "لاحقًا",
    todayCountLabel: "عنصرًا",
    calendarTitle: "التقويم",
    calendarSummary:
      "الحجوزات نفسها بعرض يومي أو أسبوعي أو حسب الموظف أو كقائمة. كل إجراء يعيد التحقق من السياسة على الخادم.",
    calendarUnavailable: "يبقى التقويم مغلقًا حتى يكتمل الاتصال الآمن.",
    calendarEmpty: "لا توجد حجوزات في هذا النطاق.",
    calendarViewLabel: "العرض",
    calendarViewDay: "يوم",
    calendarViewWeek: "أسبوع",
    calendarViewResource: "حسب الموظف",
    calendarViewList: "قائمة",
    calendarFilterLocation: "الموقع",
    calendarFilterStaff: "الموظف",
    calendarFilterService: "الخدمة",
    calendarFilterApply: "تطبيق",
    calendarFilterAll: "الكل",
    calendarDateLabel: "تاريخ البدء",
    calendarTimezoneNote: "تُعرض الأوقات بالمنطقة الزمنية للموقع.",
    calendarResourceUnassigned: "غير مُسند",
    calendarStatusLabel: "الحالة",
    calendarOpenBooking: "فتح في الحجوزات",
    calendarListAlternative:
      "تحمل هذه القائمة الحجوزات نفسها الموجودة في عرض اليوم والأسبوع.",
    bookingsDeliveryLabel: "البريد",
    bookingsResend: "إعادة إرسال الرسالة",
    bookingsResending: "جارٍ إعادة الإرسال",
    bookingsResultResent: "تمت جدولة إعادة إرسال الرسالة.",
    bookingsResendUnavailable: "لا يمكن إعادة إرسال هذه الرسالة.",
    bookingsTitle: "الحجوزات القادمة",
    bookingsSummary:
      "انقل حجزًا أو ألغه. يُبلَّغ العميل في الحالتين، ويتبع أي استرداد السياسة التي تم الحجز وفقها.",
    bookingsEmpty: "لا توجد حجوزات قادمة.",
    bookingsUnavailable: "تبقى الحجوزات مغلقة حتى يكتمل الاتصال الآمن.",
    bookingsListLabel: "الحجوزات القادمة",
    bookingsWhenLabel: "الموعد",
    bookingsStatusLabel: "الحالة",
    bookingsCancel: "إلغاء الحجز",
    bookingsCancelling: "جارٍ الإلغاء",
    bookingsReschedule: "نقل الحجز",
    bookingsNewTimeLabel: "الوقت الجديد",
    bookingsResultCancelled: "تم إلغاء الحجز وسيُبلَّغ العميل.",
    bookingsResultMoved: "تم نقل الحجز وسيُبلَّغ العميل.",
    requestsTitle: "طلبات الحجز",
    requestsSummary:
      "تنتظر الطلبات قرارًا هنا. القبول يحجز الوقت، ويُبلَّغ العميل في الحالتين.",
    requestsEmpty: "لا توجد طلبات تنتظر قرارًا.",
    requestsUnavailable: "تبقى الطلبات مغلقة حتى يكتمل الاتصال الآمن.",
    requestsQueueLabel: "طلبات تنتظر قرارًا",
    requestsRequestedAtLabel: "تاريخ الطلب",
    requestsDeadlineLabel: "الرد قبل",
    requestsCustomerLabel: "العميل",
    requestsCustomerHidden: "مخفي حسب دورك",
    requestsIntakeLabel: "إجابات النموذج",
    requestsIntakePresent: "متوفرة",
    requestsIntakeAbsent: "لا توجد",
    requestsProposalLabel: "وقت مقترح بانتظار العميل",
    requestsAccept: "قبول",
    requestsReject: "رفض",
    requestsPropose: "اقتراح وقت آخر",
    requestsProposeTimeLabel: "الوقت المقترح",
    requestsPublicReasonLabel: "رسالة إلى العميل",
    requestsPublicReasonHint: "تظهر للعميل. اجعلها قصيرة وواضحة.",
    requestsInternalReasonLabel: "ملاحظة داخلية",
    requestsInternalReasonHint: "تُحفظ في سجل الحجز ولا تظهر للعميل أبدًا.",
    requestsResultAccepted: "تم قبول الطلب وحجز الوقت.",
    requestsResultRejected: "تم رفض الطلب وسيُبلَّغ العميل.",
    requestsResultProposed: "تم إرسال اقتراحك إلى العميل.",
    requestsResultConflict:
      "اتخذ شخص آخر القرار قبلك أو انتهى موعد الرد. تم تحديث القائمة.",
    requestsResultUnavailable: "القرار غير متاح مؤقتًا، ولم يتغيّر شيء.",
    requestsResultInvalid: "راجع الحقول المحددة ثم أعد المحاولة.",
    requestsResultNotAuthorized: "لا يسمح دورك باتخاذ قرار بشأن هذا الطلب.",
    requestsResultSlotUnavailable: "لم يعد هذا الوقت متاحًا، لذا لم يُقبل الطلب.",
    requestsProposalLinkLabel: "رابط العميل",
    requestsProposalLinkHint:
      "أرسل هذا الرابط إلى العميل. يظهر مرة واحدة ويعمل لهذا الاقتراح فقط.",
    requestsPriceLabel: "الإجمالي",
    navRequests: "الطلبات",
    eyebrow: "مساحة عمل فريق المستأجر",
    title: "يبقى يومك واضحًا حتى عندما يمتلئ الجدول.",
    summary: "واجهة تشغيلية واحدة للوصول والطلبات والمدفوعات والاستثناءات.",
    status: "واجهة لوحة التحكم جاهزة",
    navToday: "اليوم",
    navCalendar: "التقويم",
    navBookings: "الحجوزات",
    navCustomers: "العملاء",
    navTeamResources: "الفريق والموارد",
    navBrand: "الهوية والموقع",
    metricArrivals: "وصول اليوم",
    metricRequests: "الطلبات المعلّقة",
    metricPayments: "مدفوعات تتطلب إجراءً",
    scheduleTitle: "التالي خلال اليوم",
    scheduleEmpty: "لا توجد بيانات مستأجر مباشرة متصلة في إصدار التأسيس هذا.",
    listAlternative: "قائمة الجدول الميسّرة",
    openCalendar: "فتح التقويم",
    gridView: "عرض شبكي",
    listView: "عرض كقائمة",
    viewSelector: "طريقة عرض الجدول",
    viewChangedGrid: "يُعرض الجدول في شبكة مختصرة.",
    viewChangedList: "يُعرض الجدول في قائمة ميسّرة.",
    timeZoneLabel: "المنطقة الزمنية",
    scheduleConsultation: "استشارة أولية · ليلى حسن",
    scheduleFollowUp: "متابعة · عمر كريم",
    statusConfirmed: "مؤكد",
    statusRequested: "قيد الطلب",
    primaryNavigation: "التنقل الرئيسي",
    languageNavigation: "اللغة",
    languageEnglish: "الإنجليزية",
    languageArabic: "العربية",
    brandLabel: "عمليات نوى",
    todaySummary: "ملخص اليوم",
    notFoundTitle: "مساحة العمل غير موجودة",
    returnHome: "العودة إلى مساحة العمل",
    privateStatus: "عرض خاص بالمستأجر",
    configurationTitle: "إعداد مساحة العمل غير متاح",
    configurationSummary: "تظل مساحة العمل الخاصة مغلقة حتى يكتمل إعداد الاتصال الآمن.",
    signInTitle: "تسجيل الدخول مطلوب",
    signInSummary: "سجّل الدخول للتحقق من عضويتك الحالية لدى المستأجر.",
    deniedTitle: "الوصول غير متاح",
    deniedSummary:
      "تعذر التحقق من مساحة العمل واسم النطاق والعضوية معًا. لم يتم عرض أي بيانات للمستأجر.",
    selectionTitle: "اختر مساحة عمل",
    selectionSummary:
      "يرتبط حسابك بأكثر من مستأجر. اختر مساحة العمل التي تريد الدخول إليها.",
    selectTenant: "فتح مساحة العمل",
    workspaceTitle: "سياق مساحة العمل الموثق",
    tenantLabel: "المستأجر",
    roleLabel: "الدور الحالي",
    locationsLabel: "المواقع المسموح بها",
    capabilitiesLabel: "الصلاحيات الحالية",
    mfaVerified: "تم التحقق من ضمان المصادقة متعددة العوامل",
    mfaNotVerified: "التحقق الإضافي متعدد العوامل غير نشط",
    navAvailability: "التوافر",
    availabilityTitle: "جداول العمل",
    availabilitySummary:
      "اضبط ساعات العمل الأسبوعية والاستراحات والإغلاقات وقواعد الحجز ضمن المنطقة الزمنية للموقع.",
    scheduleEditorTitle: "إضافة فترة عمل أسبوعية",
    scheduleDayLabel: "يوم الأسبوع (0 الأحد – 6 السبت)",
    scheduleStartLabel: "دقيقة البداية",
    scheduleEndLabel: "دقيقة النهاية",
    scheduleSave: "حفظ الجدول",
    scheduleSaved: "تم حفظ الجدول.",
    scheduleSaveError:
      "تعذر حفظ الجدول. تحقق من القيم أو أعد التحميل للحصول على إصدار أحدث.",
    scheduleUnavailable: "تحرير الجدول غير متاح حتى يتم اختيار مساحة مستأجر موثقة.",
    scheduleOperationLabel: "نوع الإعداد",
    scheduleScopeOption: "نطاق الجدول",
    scheduleWeeklyOption: "ساعات أسبوعية",
    scheduleBreakOption: "استراحة",
    scheduleExceptionOption: "استثناء بتاريخ",
    scheduleTimeOffOption: "إجازة موظف أو مورد",
    scheduleHolidayOption: "عطلة",
    scheduleBlackoutOption: "إغلاق الموقع",
    scheduleMaintenanceOption: "صيانة المورد",
    schedulePolicyOption: "تجاوز سياسة",
    scheduleScopeLabel: "النطاق الحالي",
    scheduleNewScopeOption: "نطاق جديد",
    scheduleScopeKindLabel: "نوع النطاق",
    scheduleLocationOption: "موقع",
    scheduleStaffOption: "موظف",
    scheduleResourceOption: "مورد",
    scheduleLocationIdLabel: "معرّف الموقع",
    scheduleStaffIdLabel: "معرّف الموظف",
    scheduleResourceIdLabel: "معرّف المورد",
    scheduleServiceIdLabel: "معرّف الخدمة",
    scheduleDateLabel: "التاريخ المحلي",
    scheduleExceptionKindLabel: "نوع الاستثناء",
    scheduleClosedOption: "مغلق",
    scheduleOverrideOption: "ساعات بديلة",
    scheduleStartsAtLabel: "وقت البداية (لحظة UTC)",
    scheduleEndsAtLabel: "وقت النهاية (لحظة UTC)",
    scheduleNameLabel: "اسم العطلة",
    scheduleReasonLabel: "السبب الداخلي",
    schedulePolicyKeyLabel: "مفتاح السياسة",
    schedulePolicyValueLabel: "قيمة السياسة",
    availabilityPreviewTitle: "معاينة الأوقات القابلة للحجز",
    availabilityPreviewSummary:
      "استخدم قواعد الأوقات الاستشارية نفسها المستخدمة في موقع الحجز العام.",
    availabilityWindowStartLabel: "بداية النطاق (UTC)",
    availabilityWindowEndLabel: "نهاية النطاق (UTC)",
    availabilityPartySizeLabel: "عدد الأشخاص",
    availabilityStaffPreferenceLabel: "معرّف الموظف المفضل (اختياري)",
    availabilityPreviewAction: "التحقق من التوافر",
    availabilityAdvisory:
      "هذه الأوقات استشارية. يعاد التحقق من التوافر دائمًا عند تأكيد الحجز.",
    availabilityNoSlots: "لا توجد أوقات قابلة للحجز ضمن هذا النطاق. جرّب تواريخ أخرى.",
    availabilityNoSlotsCapacity:
      "السعة غير متاحة ضمن هذا النطاق. جرّب وقتًا أو موقعًا آخر.",
    availabilityNoSlotsPolicy:
      "تقيد قواعد الحجز هذا النطاق. جرّب تواريخ أو موظفًا آخر.",
    availabilityNoSlotsWindow:
      "يقع هذا النطاق خارج مهلة أو أفق الحجز. اختر تواريخ لاحقة.",
    availabilityPreviewError:
      "تعذر التحقق من التوافر. تحقق من عوامل التصفية وحاول مجددًا.",
    availabilityLocationTimeZone: "المنطقة الزمنية للموقع",
    availabilityCustomerTimeZone: "المنطقة الزمنية للعميل",
  },
};

export function getDashboardMessage(locale: Locale, key: DashboardMessageKey) {
  return dashboardCopy[locale][key];
}
