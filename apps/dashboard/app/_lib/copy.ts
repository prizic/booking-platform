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
  | "paymentsTitle"
  | "paymentsSummary"
  | "paymentsUnavailable"
  | "paymentsStatusLabel"
  | "paymentsStatusOpen"
  | "paymentsStatusResolved"
  | "paymentsStatusAll"
  | "paymentsFilterAction"
  | "paymentsQueueTitle"
  | "paymentsQueueEmpty"
  | "paymentsDetailLabel"
  | "paymentsAmountLabel"
  | "paymentsRaisedLabel"
  | "paymentsResolvedAs"
  | "paymentsRetryRefund"
  | "paymentsNoteLabel"
  | "paymentsResolutionLabel"
  | "paymentsResolveAction"
  | "paymentsRefundsTitle"
  | "paymentsRefundsEmpty"
  | "paymentsAttempts"
  | "paymentsResultResolved"
  | "paymentsResultAlreadyResolved"
  | "paymentsResultNotEligible"
  | "paymentsResultRefundRequested"
  | "navPayments"
  | "customersTitle"
  | "customersSummary"
  | "customersUnavailable"
  | "customersEmpty"
  | "customersSearchLabel"
  | "customersSearchAction"
  | "customersIncludeErased"
  | "customersListLabel"
  | "customersEmailLabel"
  | "customersPhoneLabel"
  | "customersNoPhone"
  | "customersBookingCountLabel"
  | "customersLastBookingLabel"
  | "customersNeverBooked"
  | "customersOpenDetail"
  | "customersErasedName"
  | "customersErasedValue"
  | "customersBadgeErased"
  | "customersBadgeHold"
  | "customersBadgeRestricted"
  | "customersBadgeSuppressed"
  | "customersSinceLabel"
  | "customersSensitiveNotesLabel"
  | "customersIntakeLabel"
  | "customersRestrictionReasonLabel"
  | "customersBookingsTitle"
  | "customersNoBookings"
  | "customersBookedAs"
  | "customersConsentsTitle"
  | "customersNoConsents"
  | "customersCorrectTitle"
  | "customersNameLabel"
  | "customersCorrectHint"
  | "customersCorrectAction"
  | "customersRightsTitle"
  | "customersReasonLabel"
  | "customersRestrictAction"
  | "customersUnrestrictAction"
  | "customersPlaceHoldAction"
  | "customersReleaseHoldAction"
  | "customersJobsHint"
  | "customersExportAction"
  | "customersDeleteAction"
  | "customersJobsTitle"
  | "customersNoJobs"
  | "customersPendingSteps"
  | "customersTagsLabel"
  | "customersExportTitle"
  | "customersExportExpires"
  | "customersExportReveal"
  | "customersResultCorrected"
  | "customersResultRestricted"
  | "customersResultUnrestricted"
  | "customersResultHeld"
  | "customersResultReleased"
  | "customersResultExported"
  | "customersResultDeleted"
  | "customersResultDeletionBlocked"
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
  | "bookingsSearchLabel"
  | "bookingsSearchAction"
  | "bookingsStatusFilterLabel"
  | "bookingsStatusAll"
  | "bookingsOpenDetail"
  | "bookingsNotesLabel"
  | "bookingsResultCheckedIn"
  | "bookingsResultCompleted"
  | "bookingsResultNoShow"
  | "bookingsResultCorrected"
  | "bookingsResultNoteAdded"
  | "bookingsResultNotAllowed"
  | "bookingsResultReasonRequired"
  | "detailTitle"
  | "detailUnavailable"
  | "detailBackToList"
  | "detailHistoryTitle"
  | "detailHistoryActorLabel"
  | "detailNotesTitle"
  | "detailNotesEmpty"
  | "detailNoteOperational"
  | "detailNoteSensitive"
  | "detailAddNoteTitle"
  | "detailNoteBodyLabel"
  | "detailNoteVisibilityLabel"
  | "detailAddNote"
  | "detailLifecycleTitle"
  | "detailLifecycleHint"
  | "detailCheckIn"
  | "detailComplete"
  | "detailNoShow"
  | "detailCorrect"
  | "detailReasonLabel"
  | "detailPaymentLabel"
  | "detailPriceLabel"
  | "detailCustomerLabel"
  | "detailContactHidden"
  | "detailIntakePresent"
  | "detailIntakeAbsent"
  | "detailRescheduleCountLabel"
  | "detailDurationLabel"
  | "detailReferenceLabel"
  | "detailEmailLabel"
  | "detailPhoneLabel"
  | "detailLocationLabel"
  | "detailCancelledAtLabel"
  | "detailRefundLabel"
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
    navPayments: "Payments",
    paymentsTitle: "Payments",
    paymentsSummary:
      "Refunds, disputes, payouts, and anything the payment provider and this platform disagree about. Every item here is money that needs a decision.",
    paymentsUnavailable:
      "The payment queue could not be loaded. This is not an empty queue.",
    paymentsStatusLabel: "Show",
    paymentsStatusOpen: "Open",
    paymentsStatusResolved: "Resolved",
    paymentsStatusAll: "Everything",
    paymentsFilterAction: "Apply",
    paymentsQueueTitle: "Needs a decision",
    paymentsQueueEmpty: "Nothing needs a decision right now.",
    paymentsDetailLabel: "What happened",
    paymentsAmountLabel: "Amount",
    paymentsRaisedLabel: "Raised",
    paymentsResolvedAs: "Resolved as",
    paymentsRetryRefund: "Request the refund again",
    paymentsNoteLabel: "Note (recorded in the audit trail)",
    paymentsResolutionLabel: "How was this resolved?",
    paymentsResolveAction: "Resolve",
    paymentsRefundsTitle: "Refunds",
    paymentsRefundsEmpty: "No refund has been requested yet.",
    paymentsAttempts: "attempts",
    paymentsResultResolved: "The item was resolved and the decision recorded.",
    paymentsResultAlreadyResolved:
      "Somebody else resolved this first. Reload to see how they closed it.",
    paymentsResultNotEligible:
      "This booking does not earn that refund. Check the cancellation policy it was made under.",
    paymentsResultRefundRequested:
      "The refund was requested. It will be sent to the provider shortly.",
    customersTitle: "Customers",
    customersSummary:
      "Everyone this business has taken a booking from, and the privacy rights they can exercise. Identity is built from bookings; correcting a record here never rewrites the bookings it already has.",
    customersUnavailable:
      "The customer directory could not be loaded. This is not an empty directory.",
    customersEmpty: "No customer matches this search.",
    customersSearchLabel: "Search by name, email, or phone",
    customersSearchAction: "Search",
    customersIncludeErased: "Include erased records",
    customersListLabel: "Customer directory",
    customersEmailLabel: "Email",
    customersPhoneLabel: "Phone",
    customersNoPhone: "No phone on file",
    customersBookingCountLabel: "Bookings",
    customersLastBookingLabel: "Most recent booking",
    customersNeverBooked: "None yet",
    customersOpenDetail: "Open customer record",
    customersErasedName: "Erased customer",
    customersErasedValue: "Erased",
    customersBadgeErased: "Erased",
    customersBadgeHold: "Legal hold",
    customersBadgeRestricted: "Processing restricted",
    customersBadgeSuppressed: "Email suppressed",
    customersSinceLabel: "Customer since",
    customersSensitiveNotesLabel: "Sensitive notes on file",
    customersIntakeLabel: "Intake answers on file",
    customersRestrictionReasonLabel: "Restriction reason",
    customersBookingsTitle: "Booking history",
    customersNoBookings: "No bookings on this record.",
    customersBookedAs: "booked as",
    customersConsentsTitle: "Consent record",
    customersNoConsents: "No consent evidence on this record.",
    customersCorrectTitle: "Correct this record",
    customersNameLabel: "Full name",
    customersCorrectHint:
      "A correction changes the current record only. Past bookings keep the contact details they were made under.",
    customersCorrectAction: "Save correction",
    customersRightsTitle: "Privacy requests",
    customersReasonLabel: "Reason (recorded in the audit trail)",
    customersRestrictAction: "Restrict processing",
    customersUnrestrictAction: "Lift restriction",
    customersPlaceHoldAction: "Place legal hold",
    customersReleaseHoldAction: "Release legal hold",
    customersJobsHint:
      "Export and deletion run across every system that holds this person's data and report each one. Backups expire on their own retention and are never edited.",
    customersExportAction: "Export this record",
    customersDeleteAction: "Delete this record",
    customersJobsTitle: "Request history",
    customersNoJobs: "No privacy request has been made for this record.",
    customersPendingSteps: "steps still open",
    customersTagsLabel: "Tags (comma separated)",
    customersExportTitle: "Latest export",
    customersExportExpires: "This export expires on",
    customersExportReveal: "Show the exported record",
    customersResultCorrected: "The record was corrected. Past bookings are unchanged.",
    customersResultRestricted:
      "Processing is restricted and email to this address is suppressed.",
    customersResultUnrestricted:
      "The restriction was lifted. Any provider bounce or complaint still stands.",
    customersResultHeld: "A legal hold is in place. Deletion is suspended.",
    customersResultReleased: "The legal hold was released.",
    customersResultExported: "The export is ready and expires in seven days.",
    customersResultDeleted:
      "The record was erased. Bookings remain as financial evidence with the contact details removed.",
    customersResultDeletionBlocked:
      "Deletion was refused: a legal hold outranks it. Release the hold first.",
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
    bookingsSearchLabel: "Search reference, service, or customer",
    bookingsSearchAction: "Search",
    bookingsStatusFilterLabel: "Status",
    bookingsStatusAll: "Any status",
    bookingsOpenDetail: "Open booking",
    bookingsNotesLabel: "Notes",
    bookingsResultCheckedIn: "Checked in.",
    bookingsResultCompleted: "Marked complete.",
    bookingsResultNoShow: "Marked as a no-show.",
    bookingsResultCorrected: "Status corrected.",
    bookingsResultNoteAdded: "Note added.",
    bookingsResultNotAllowed:
      "This booking cannot make that change from its current status.",
    bookingsResultReasonRequired: "Correcting a recorded status needs a reason.",
    detailTitle: "Booking",
    detailUnavailable: "This booking is not available to you.",
    detailBackToList: "Back to bookings",
    detailHistoryTitle: "Status history",
    detailHistoryActorLabel: "Acted by",
    detailNotesTitle: "Notes",
    detailNotesEmpty: "No notes you can read.",
    detailNoteOperational: "Operational",
    detailNoteSensitive: "Sensitive",
    detailAddNoteTitle: "Add a note",
    detailNoteBodyLabel: "Note",
    detailNoteVisibilityLabel: "Who may read it",
    detailAddNote: "Save note",
    detailLifecycleTitle: "Appointment actions",
    detailLifecycleHint:
      "Only the changes this booking can make from its current status will succeed.",
    detailCheckIn: "Check in",
    detailComplete: "Complete",
    detailNoShow: "Mark no-show",
    detailCorrect: "Correct status",
    detailReasonLabel: "Internal reason",
    detailPaymentLabel: "Payment",
    detailPriceLabel: "Total",
    detailCustomerLabel: "Customer",
    detailContactHidden: "Hidden by your role",
    detailIntakePresent: "Intake answers were provided",
    detailIntakeAbsent: "No intake answers",
    detailRescheduleCountLabel: "Times moved",
    detailDurationLabel: "Duration",
    detailReferenceLabel: "Reference",
    detailEmailLabel: "Email",
    detailPhoneLabel: "Phone",
    detailLocationLabel: "Location",
    detailCancelledAtLabel: "Cancelled",
    detailRefundLabel: "Refund eligible",
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
    navPayments: "المدفوعات",
    paymentsTitle: "المدفوعات",
    paymentsSummary:
      "المبالغ المستردة والنزاعات والتحويلات، وكل ما يختلف عليه مزوّد الدفع وهذه المنصّة. كل عنصر هنا مال يحتاج إلى قرار.",
    paymentsUnavailable: "تعذّر تحميل قائمة المدفوعات. هذه ليست قائمة فارغة.",
    paymentsStatusLabel: "العرض",
    paymentsStatusOpen: "مفتوح",
    paymentsStatusResolved: "تمت المعالجة",
    paymentsStatusAll: "الكل",
    paymentsFilterAction: "تطبيق",
    paymentsQueueTitle: "يحتاج إلى قرار",
    paymentsQueueEmpty: "لا شيء يحتاج إلى قرار الآن.",
    paymentsDetailLabel: "ما الذي حدث",
    paymentsAmountLabel: "المبلغ",
    paymentsRaisedLabel: "تاريخ الرصد",
    paymentsResolvedAs: "تمت المعالجة بـ",
    paymentsRetryRefund: "إعادة طلب الاسترداد",
    paymentsNoteLabel: "ملاحظة (تُسجَّل في سجل التدقيق)",
    paymentsResolutionLabel: "كيف تمت المعالجة؟",
    paymentsResolveAction: "معالجة",
    paymentsRefundsTitle: "المبالغ المستردة",
    paymentsRefundsEmpty: "لم يُطلب أي استرداد بعد.",
    paymentsAttempts: "محاولات",
    paymentsResultResolved: "تمت معالجة العنصر وتسجيل القرار.",
    paymentsResultAlreadyResolved:
      "عالجها شخص آخر قبلك. أعد التحميل لمعرفة كيف أُغلقت.",
    paymentsResultNotEligible:
      "هذا الحجز لا يستحق ذلك الاسترداد. راجع سياسة الإلغاء التي أُجري بموجبها.",
    paymentsResultRefundRequested: "تم طلب الاسترداد وسيُرسل إلى المزوّد قريباً.",
    customersTitle: "العملاء",
    customersSummary:
      "كل من حجز لدى هذا النشاط، وحقوق الخصوصية التي يمكنه ممارستها. تُبنى الهوية من الحجوزات، وتصحيح السجل هنا لا يُعدّل الحجوزات السابقة.",
    customersUnavailable: "تعذّر تحميل دليل العملاء. هذا ليس دليلاً فارغاً.",
    customersEmpty: "لا يوجد عميل مطابق لهذا البحث.",
    customersSearchLabel: "ابحث بالاسم أو البريد أو الهاتف",
    customersSearchAction: "بحث",
    customersIncludeErased: "تضمين السجلات الممحوّة",
    customersListLabel: "دليل العملاء",
    customersEmailLabel: "البريد الإلكتروني",
    customersPhoneLabel: "الهاتف",
    customersNoPhone: "لا يوجد رقم هاتف",
    customersBookingCountLabel: "الحجوزات",
    customersLastBookingLabel: "أحدث حجز",
    customersNeverBooked: "لا يوجد بعد",
    customersOpenDetail: "فتح سجل العميل",
    customersErasedName: "عميل ممحوّ",
    customersErasedValue: "ممحوّ",
    customersBadgeErased: "ممحوّ",
    customersBadgeHold: "حجز قانوني",
    customersBadgeRestricted: "المعالجة مقيّدة",
    customersBadgeSuppressed: "البريد موقوف",
    customersSinceLabel: "عميل منذ",
    customersSensitiveNotesLabel: "ملاحظات حسّاسة مسجّلة",
    customersIntakeLabel: "إجابات استمارة مسجّلة",
    customersRestrictionReasonLabel: "سبب التقييد",
    customersBookingsTitle: "سجل الحجوزات",
    customersNoBookings: "لا توجد حجوزات في هذا السجل.",
    customersBookedAs: "حجز باسم",
    customersConsentsTitle: "سجل الموافقات",
    customersNoConsents: "لا يوجد دليل موافقة في هذا السجل.",
    customersCorrectTitle: "تصحيح هذا السجل",
    customersNameLabel: "الاسم الكامل",
    customersCorrectHint:
      "التصحيح يغيّر السجل الحالي فقط. تحتفظ الحجوزات السابقة ببيانات التواصل التي أُجريت بها.",
    customersCorrectAction: "حفظ التصحيح",
    customersRightsTitle: "طلبات الخصوصية",
    customersReasonLabel: "السبب (يُسجَّل في سجل التدقيق)",
    customersRestrictAction: "تقييد المعالجة",
    customersUnrestrictAction: "رفع التقييد",
    customersPlaceHoldAction: "وضع حجز قانوني",
    customersReleaseHoldAction: "رفع الحجز القانوني",
    customersJobsHint:
      "يعمل التصدير والحذف عبر كل نظام يحتفظ ببيانات هذا الشخص ويبلّغ عن كل واحد منها. تنتهي النسخ الاحتياطية بمدة استبقائها ولا تُعدَّل.",
    customersExportAction: "تصدير هذا السجل",
    customersDeleteAction: "حذف هذا السجل",
    customersJobsTitle: "سجل الطلبات",
    customersNoJobs: "لم يُقدَّم أي طلب خصوصية لهذا السجل.",
    customersPendingSteps: "خطوات ما زالت مفتوحة",
    customersTagsLabel: "الوسوم (مفصولة بفواصل)",
    customersExportTitle: "أحدث تصدير",
    customersExportExpires: "تنتهي صلاحية هذا التصدير في",
    customersExportReveal: "إظهار السجل المُصدَّر",
    customersResultCorrected: "تم تصحيح السجل. الحجوزات السابقة لم تتغيّر.",
    customersResultRestricted: "المعالجة مقيّدة والبريد إلى هذا العنوان موقوف.",
    customersResultUnrestricted:
      "تم رفع التقييد. أي ارتداد أو شكوى من المزوّد ما زال سارياً.",
    customersResultHeld: "يوجد حجز قانوني. الحذف معلّق.",
    customersResultReleased: "تم رفع الحجز القانوني.",
    customersResultExported: "التصدير جاهز وتنتهي صلاحيته خلال سبعة أيام.",
    customersResultDeleted:
      "تم محو السجل. تبقى الحجوزات كدليل مالي بعد إزالة بيانات التواصل.",
    customersResultDeletionBlocked:
      "رُفض الحذف: الحجز القانوني يعلو عليه. ارفع الحجز أولاً.",
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
    bookingsSearchLabel: "ابحث بالمرجع أو الخدمة أو العميل",
    bookingsSearchAction: "بحث",
    bookingsStatusFilterLabel: "الحالة",
    bookingsStatusAll: "أي حالة",
    bookingsOpenDetail: "فتح الحجز",
    bookingsNotesLabel: "الملاحظات",
    bookingsResultCheckedIn: "تم تسجيل الوصول.",
    bookingsResultCompleted: "تم وضع علامة الإكمال.",
    bookingsResultNoShow: "تم وضع علامة عدم الحضور.",
    bookingsResultCorrected: "تم تصحيح الحالة.",
    bookingsResultNoteAdded: "تمت إضافة الملاحظة.",
    bookingsResultNotAllowed: "لا يمكن لهذا الحجز إجراء هذا التغيير من حالته الحالية.",
    bookingsResultReasonRequired: "تصحيح حالة مسجلة يتطلب ذكر السبب.",
    detailTitle: "الحجز",
    detailUnavailable: "هذا الحجز غير متاح لك.",
    detailBackToList: "العودة إلى الحجوزات",
    detailHistoryTitle: "سجل الحالات",
    detailHistoryActorLabel: "نفّذها",
    detailNotesTitle: "الملاحظات",
    detailNotesEmpty: "لا توجد ملاحظات يمكنك قراءتها.",
    detailNoteOperational: "تشغيلية",
    detailNoteSensitive: "حساسة",
    detailAddNoteTitle: "إضافة ملاحظة",
    detailNoteBodyLabel: "الملاحظة",
    detailNoteVisibilityLabel: "من يمكنه قراءتها",
    detailAddNote: "حفظ الملاحظة",
    detailLifecycleTitle: "إجراءات الموعد",
    detailLifecycleHint: "تنجح فقط التغييرات المتاحة لهذا الحجز من حالته الحالية.",
    detailCheckIn: "تسجيل الوصول",
    detailComplete: "إكمال",
    detailNoShow: "تسجيل عدم الحضور",
    detailCorrect: "تصحيح الحالة",
    detailReasonLabel: "السبب الداخلي",
    detailPaymentLabel: "الدفع",
    detailPriceLabel: "الإجمالي",
    detailCustomerLabel: "العميل",
    detailContactHidden: "مخفي بحسب دورك",
    detailIntakePresent: "تم تقديم إجابات النموذج",
    detailIntakeAbsent: "لا توجد إجابات نموذج",
    detailRescheduleCountLabel: "عدد مرات النقل",
    detailDurationLabel: "المدة",
    detailReferenceLabel: "المرجع",
    detailEmailLabel: "البريد الإلكتروني",
    detailPhoneLabel: "الهاتف",
    detailLocationLabel: "الموقع",
    detailCancelledAtLabel: "أُلغي في",
    detailRefundLabel: "المبلغ المستحق للاسترداد",
    availabilityCustomerTimeZone: "المنطقة الزمنية للعميل",
  },
};

export function getDashboardMessage(locale: Locale, key: DashboardMessageKey) {
  return dashboardCopy[locale][key];
}
