export interface TravelReminder {
  id: string
  date: string // DD/MM/YYYY
  isoDate: string // YYYY-MM-DD
  dateDisplay: string // e.g. "Sat 14 Mar"
  time: string
  icon: string
  title: string
  channels: string[]
  recipient: string
  recurrence: string
  status: 'DELIVERED' | 'PENDING'
  monthIndex: number // 0-11
  important?: boolean
  notes?: string
  firesAt?: string
  timeZone?: string
  createdAt?: string
  completedAt?: string
  category?: 'Travel' | 'Culture' | string
  metadata?: Record<string, string>
}

export interface MonthAnalysis {
  summary: string
  highlights: string[]
  bankHolidayOpportunity?: string
}

export interface AttachedDocument {
  id: string
  name: string
  size: string
  uploadedAt: string
}

export const INITIAL_TRAVEL_REMINDERS: TravelReminder[] = [
  // January (month 0)
  {
    id: 'tr-2026-01-02',
    date: '02/01/2026',
    isoDate: '2026-01-02',
    dateDisplay: 'Fri 2 Jan',
    time: '08:00',
    icon: '✈️',
    title: 'Check in for Edinburgh New Year return flight',
    channels: ['WhatsApp', 'Slack'],
    recipient: 'SYSTEM',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 0,
  },
  // February (month 1)
  {
    id: 'tr-2026-02-17',
    date: '17/02/2026',
    isoDate: '2026-02-17',
    dateDisplay: 'Tue 17 Feb',
    time: '20:00',
    icon: '✈️',
    title: 'Confirm hotel booking for Lisbon offsite',
    channels: ['Email', 'WhatsApp'],
    recipient: 'me@meinc.app',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 1,
  },
  // March (month 2) - Exactly matching mockup 18_2.png!
  {
    id: 'tr-2026-03-14',
    date: '14/03/2026',
    isoDate: '2026-03-14',
    dateDisplay: 'Sat 14 Mar',
    time: '13:30',
    icon: '✈️',
    title: 'Check in for the flight',
    channels: ['WhatsApp', 'Slack'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 2,
  },
  {
    id: 'tr-2026-03-30-1',
    date: '30/03/2026',
    isoDate: '2026-03-30',
    dateDisplay: 'Mon 30 Mar',
    time: '10:45',
    icon: '✈️',
    title: 'Check in for the flight',
    channels: ['WhatsApp', 'Slack'],
    recipient: 'SYSTEM',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 2,
  },
  {
    id: 'tr-2026-03-30-2',
    date: '30/03/2026',
    isoDate: '2026-03-30',
    dateDisplay: 'Mon 30 Mar',
    time: '14:45',
    icon: '✈️',
    title: 'Check in for the flight',
    channels: ['WhatsApp', 'Slack'],
    recipient: 'SYSTEM',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 2,
  },
  // April (month 3) - Easter Bank Holiday
  {
    id: 'tr-2026-04-03',
    date: '03/04/2026',
    isoDate: '2026-04-03',
    dateDisplay: 'Fri 3 Apr',
    time: '07:15',
    icon: '✈️',
    title: 'Boarding for Nice Easter weekend getaway',
    channels: ['WhatsApp', 'Push'],
    recipient: 'LUKE',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 3,
  },
  {
    id: 'tr-2026-04-06',
    date: '06/04/2026',
    isoDate: '2026-04-06',
    dateDisplay: 'Mon 6 Apr',
    time: '18:00',
    icon: '✈️',
    title: 'Return flight check-in Nice to London Gatwick',
    channels: ['WhatsApp'],
    recipient: 'LUKE',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 3,
  },
  // May (month 4) - Early & Spring Bank Holidays
  {
    id: 'tr-2026-05-02',
    date: '02/05/2026',
    isoDate: '2026-05-02',
    dateDisplay: 'Sat 2 May',
    time: '09:30',
    icon: '✈️',
    title: 'Eurostar departure to Amsterdam',
    channels: ['WhatsApp', 'Slack'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 4,
  },
  {
    id: 'tr-2026-05-04',
    date: '04/05/2026',
    isoDate: '2026-05-04',
    dateDisplay: 'Mon 4 May',
    time: '16:20',
    icon: '✈️',
    title: 'Amsterdam return Eurostar check-in',
    channels: ['WhatsApp'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 4,
  },
  {
    id: 'tr-2026-05-23',
    date: '23/05/2026',
    isoDate: '2026-05-23',
    dateDisplay: 'Sat 23 May',
    time: '11:00',
    icon: '✈️',
    title: 'Cornwall road trip departure & car rental pickup',
    channels: ['SMS', 'Push'],
    recipient: 'SYSTEM',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 4,
  },
  // June (month 5)
  {
    id: 'tr-2026-06-12',
    date: '12/06/2026',
    isoDate: '2026-06-12',
    dateDisplay: 'Fri 12 Jun',
    time: '14:00',
    icon: '✈️',
    title: 'Book summer flights to Mallorca',
    channels: ['Slack'],
    recipient: 'LUKE',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 5,
  },
  // July (month 6)
  {
    id: 'tr-2026-07-10',
    date: '10/07/2026',
    isoDate: '2026-07-10',
    dateDisplay: 'Fri 10 Jul',
    time: '10:00',
    icon: '✈️',
    title: 'Flight check-in London Heathrow to Palma',
    channels: ['WhatsApp', 'Push'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 6,
  },
  {
    id: 'tr-2026-07-19',
    date: '19/07/2026',
    isoDate: '2026-07-19',
    dateDisplay: 'Sun 19 Jul',
    time: '19:45',
    icon: '✈️',
    title: 'Return flight Palma to London Heathrow',
    channels: ['WhatsApp'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 6,
  },
  // August (month 7) - Summer Bank Holiday
  {
    id: 'tr-2026-08-28',
    date: '28/08/2026',
    isoDate: '2026-08-28',
    dateDisplay: 'Fri 28 Aug',
    time: '08:30',
    icon: '✈️',
    title: 'Check in for Edinburgh Fringe weekend flight',
    channels: ['Slack', 'WhatsApp'],
    recipient: 'SYSTEM',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 7,
  },
  {
    id: 'tr-2026-08-31',
    date: '31/08/2026',
    isoDate: '2026-08-31',
    dateDisplay: 'Mon 31 Aug',
    time: '21:00',
    icon: '✈️',
    title: 'Edinburgh return flight check-in',
    channels: ['WhatsApp'],
    recipient: 'SYSTEM',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 7,
  },
  // September (month 8) - Current month
  {
    id: 'tr-2026-09-18',
    date: '18/09/2026',
    isoDate: '2026-09-18',
    dateDisplay: 'Fri 18 Sep',
    time: '15:30',
    icon: '✈️',
    title: 'Check-in for Berlin tech summit flights',
    channels: ['Slack', 'Push'],
    recipient: 'me@meinc.app',
    recurrence: 'Once',
    status: 'PENDING',
    monthIndex: 8,
  },
  {
    id: 'tr-2026-09-22',
    date: '22/09/2026',
    isoDate: '2026-09-22',
    dateDisplay: 'Tue 22 Sep',
    time: '18:15',
    icon: '✈️',
    title: 'Return flight Berlin Brandenburg to London',
    channels: ['Push'],
    recipient: 'me@meinc.app',
    recurrence: 'Once',
    status: 'PENDING',
    monthIndex: 8,
  },
  // October (month 9)
  {
    id: 'tr-2026-10-16',
    date: '16/10/2026',
    isoDate: '2026-10-16',
    dateDisplay: 'Fri 16 Oct',
    time: '12:00',
    icon: '✈️',
    title: 'Renew international travel insurance policy',
    channels: ['Email'],
    recipient: 'me@meinc.app',
    recurrence: 'Yearly',
    status: 'PENDING',
    monthIndex: 9,
  },
  // November (month 10)
  {
    id: 'tr-2026-11-20',
    date: '20/11/2026',
    isoDate: '2026-11-20',
    dateDisplay: 'Fri 20 Nov',
    time: '09:00',
    icon: '✈️',
    title: 'Book Christmas holiday flights and rail passes',
    channels: ['Slack'],
    recipient: 'LUKE',
    recurrence: 'Once',
    status: 'PENDING',
    monthIndex: 10,
  },
  // December (month 11) - Christmas Bank Holiday
  {
    id: 'tr-2026-12-23',
    date: '23/12/2026',
    isoDate: '2026-12-23',
    dateDisplay: 'Wed 23 Dec',
    time: '11:30',
    icon: '✈️',
    title: 'Travel to Zurich for winter ski holiday',
    channels: ['WhatsApp', 'Push'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'PENDING',
    monthIndex: 11,
  },
  {
    id: 'tr-2026-12-30',
    date: '30/12/2026',
    isoDate: '2026-12-30',
    dateDisplay: 'Wed 30 Dec',
    time: '16:00',
    icon: '✈️',
    title: 'Return flight Zurich to London Heathrow',
    channels: ['WhatsApp'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'PENDING',
    monthIndex: 11,
  },
]

// Sample additional items to reach total count 31
const ADDITIONAL_FILLERS: TravelReminder[] = [
  {
    id: 'tr-fill-1',
    date: '15/01/2026',
    isoDate: '2026-01-15',
    dateDisplay: 'Thu 15 Jan',
    time: '10:00',
    icon: '✈️',
    title: 'Check passport expiry date before spring travel',
    channels: ['Push'],
    recipient: 'SYSTEM',
    recurrence: 'Yearly',
    status: 'DELIVERED',
    monthIndex: 0,
  },
  {
    id: 'tr-fill-2',
    date: '24/02/2026',
    isoDate: '2026-02-24',
    dateDisplay: 'Tue 24 Feb',
    time: '14:30',
    icon: '✈️',
    title: 'Lisbon hotel confirmation receipt to finance',
    channels: ['Slack'],
    recipient: 'SYSTEM',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 1,
  },
  {
    id: 'tr-fill-3',
    date: '10/04/2026',
    isoDate: '2026-04-10',
    dateDisplay: 'Fri 10 Apr',
    time: '11:00',
    icon: '✈️',
    title: 'Nice trip expense report submission',
    channels: ['Email'],
    recipient: 'me@meinc.app',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 3,
  },
  {
    id: 'tr-fill-4',
    date: '18/05/2026',
    isoDate: '2026-05-18',
    dateDisplay: 'Mon 18 May',
    time: '15:00',
    icon: '✈️',
    title: 'Submit Spring Bank holiday travel leave request',
    channels: ['Slack'],
    recipient: 'LUKE',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 4,
  },
  {
    id: 'tr-fill-5',
    date: '25/06/2026',
    isoDate: '2026-06-25',
    dateDisplay: 'Thu 25 Jun',
    time: '17:30',
    icon: '✈️',
    title: 'Collect foreign currency for Mallorca trip',
    channels: ['Push'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 5,
  },
  {
    id: 'tr-fill-6',
    date: '05/07/2026',
    isoDate: '2026-07-05',
    dateDisplay: 'Sun 5 Jul',
    time: '19:00',
    icon: '✈️',
    title: 'Pack travel adapters and luggage tags',
    channels: ['Push'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 6,
  },
  {
    id: 'tr-fill-7',
    date: '15/08/2026',
    isoDate: '2026-08-15',
    dateDisplay: 'Sat 15 Aug',
    time: '13:00',
    icon: '✈️',
    title: 'Confirm Edinburgh Fringe festival apartment check-in',
    channels: ['WhatsApp'],
    recipient: 'SYSTEM',
    recurrence: 'Once',
    status: 'DELIVERED',
    monthIndex: 7,
  },
  {
    id: 'tr-fill-8',
    date: '04/09/2026',
    isoDate: '2026-09-04',
    dateDisplay: 'Fri 4 Sep',
    time: '16:00',
    icon: '✈️',
    title: 'Download Berlin offline maps and U-Bahn pass',
    channels: ['Push'],
    recipient: 'me@meinc.app',
    recurrence: 'DELIVERED' as any,
    status: 'DELIVERED',
    monthIndex: 8,
  },
  {
    id: 'tr-fill-9',
    date: '28/10/2026',
    isoDate: '2026-10-28',
    dateDisplay: 'Wed 28 Oct',
    time: '10:00',
    icon: '✈️',
    title: 'Book ski equipment hire for December trip',
    channels: ['Email'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'PENDING',
    monthIndex: 9,
  },
  {
    id: 'tr-fill-10',
    date: '10/11/2026',
    isoDate: '2026-11-10',
    dateDisplay: 'Tue 10 Nov',
    time: '18:00',
    icon: '✈️',
    title: 'Confirm Zurich chalet reservation',
    channels: ['WhatsApp'],
    recipient: 'ANA',
    recurrence: 'Once',
    status: 'PENDING',
    monthIndex: 10,
  },
]

export const ALL_TRAVEL_REMINDERS: TravelReminder[] = [
  ...INITIAL_TRAVEL_REMINDERS,
  ...ADDITIONAL_FILLERS,
]

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const MONTH_ANALYSES: Record<number, MonthAnalysis> = {
  0: {
    summary: 'Light post-holiday travel schedule with return from New Year break.',
    highlights: [
      'New Year bank holiday weekend concluded 4 Jan.',
      'Passport validity verified for upcoming spring bookings.',
    ],
    bankHolidayOpportunity: 'No remaining bank holidays in January.',
  },
  1: {
    summary: 'Corporate offsite preparations in Lisbon.',
    highlights: [
      'Accommodations confirmed at Lisbon offsite venue.',
      'Expenses processed and routed to finance.',
    ],
    bankHolidayOpportunity: 'Consider booking ahead for April Easter 4-day weekend.',
  },
  2: {
    summary: 'Active flight check-in schedule connecting mid-month and end-of-month departures.',
    highlights: [
      'ANA flight check-in scheduled for Sat 14 Mar.',
      'Dual outbound flights on Mon 30 Mar for ANA and SYSTEM.',
    ],
    bankHolidayOpportunity: 'Pre-Easter runway: ideal period to plan leave wrapping around Good Friday (3 Apr).',
  },
  3: {
    summary: 'Easter holiday window with 4 consecutive days off across Good Friday and Easter Monday.',
    highlights: [
      'Nice getaway taking advantage of 3–6 Apr bank holiday.',
      'Return connection into Gatwick on Easter Monday.',
    ],
    bankHolidayOpportunity: 'Maximized 4 days of leisure with zero annual leave days used!',
  },
  4: {
    summary: 'Two major UK bank holiday weekends: Early May (4 May) and Spring Bank Holiday (25 May).',
    highlights: [
      'Eurostar city break to Amsterdam across Early May long weekend.',
      'Cornwall road trip planned for Spring Bank Holiday.',
    ],
    bankHolidayOpportunity: 'Taking 4 days of leave between 26–29 May yields a full 9-day break.',
  },
  5: {
    summary: 'Mid-year summer prep with flights finalized for Mallorca.',
    highlights: [
      'Mallorca flights booked with partner.',
      'Foreign currency and logistics prepared.',
    ],
  },
  6: {
    summary: 'Peak summer holiday in the Balearic Islands.',
    highlights: [
      'Mallorca summer trip active 10–19 July.',
      'Luggage and travel adapters arranged.',
    ],
  },
  7: {
    summary: 'August Summer Bank Holiday weekend in Edinburgh.',
    highlights: [
      'Edinburgh Fringe Festival departure on Fri 28 Aug.',
      'Return flight aligned with bank holiday Monday 31 Aug.',
    ],
    bankHolidayOpportunity: 'Took advantage of Summer Bank Holiday weekend.',
  },
  8: {
    summary: 'Autumn European tech summit schedule in Berlin.',
    highlights: [
      'Berlin tech summit departures Fri 18 Sep.',
      'Return flights Tue 22 Sep.',
    ],
  },
  9: {
    summary: 'Routine maintenance and annual travel insurance renewal window.',
    highlights: [
      'Annual multi-trip policy review scheduled.',
      'Early bird winter ski rentals confirmed.',
    ],
  },
  10: {
    summary: 'End-of-year holiday planning and train pass confirmations.',
    highlights: [
      'Chalet in Zurich secured for late December.',
      'Rail passes booked ahead of holiday surge.',
    ],
  },
  11: {
    summary: 'Festive winter getaway over Christmas and Boxing Day bank holidays.',
    highlights: [
      'Zurich winter ski holiday from 23 Dec.',
      'Return flight 30 Dec before New Year.',
    ],
    bankHolidayOpportunity: 'Christmas (25 Dec) & Boxing Day substitute (28 Dec) create an automatic 4-day weekend.',
  },
}

export const INITIAL_ATTACHED_DOCS: Record<number, AttachedDocument[]> = {
  2: [
    {
      id: 'doc-1',
      name: 'ANA_Boarding_Pass_Mar14.pdf',
      size: '1.2 MB',
      uploadedAt: '12 Mar 2026',
    },
    {
      id: 'doc-2',
      name: 'Hotel_Reservation_March_30.pdf',
      size: '420 KB',
      uploadedAt: '18 Mar 2026',
    },
  ],
  8: [
    {
      id: 'doc-3',
      name: 'Berlin_Summit_Ticket.pdf',
      size: '850 KB',
      uploadedAt: '01 Sep 2026',
    },
  ],
}
