# Seatline

Book intercity bus seats in Ghana online: see which bus is loading, pick your seat on a live map, pay with mobile money and board with a QR ticket.

Passengers no longer have to travel to the station to find out which bus is loading or whether there is a seat left. Station agents sell walk-in seats and scan tickets from the same system, and bus operators manage trips, buses and seat layouts.

> **Status:** the frontend (`client/`) is built from the design with mock data. The NestJS backend (`server/`) has not been started yet.

## Design

All screens were designed before any code was written. The design has 22 screens, each with desktop, tablet (768 px) and phone (390 px) versions.

| # | Screen | Who uses it | Route in `client/` |
| --- | --- | --- | --- |
| 1 | Home and search | Passenger | `/` |
| 2 | Buses on the route | Passenger | `/trips` |
| 3 | Pick a seat | Passenger | `/trips/:tripId/seat` |
| 4 | Pay with mobile money | Passenger | `/trips/:tripId/pay` |
| 5 | E-ticket | Passenger | `/ticket` |
| 6 | Loading console | Station agent | `/agent` |
| 7 | Scan ticket | Station agent | `/agent/scan` |
| 8 | Overview | Operator | `/operator` |
| 9 | Seat layout editor | Operator |  (or ) |
| 10 | Sign in | Passenger |  |
| 11 | Staff sign in | Agent, operator |  |
| 12 | My tickets | Passenger |  (one ticket: ) |
| 13 | Approve payment on phone | Passenger |  |
| 14 | Payment failed | Passenger |  |
| 15 | Sell walk-in seat | Station agent |  |
| 16 | Trips | Operator |  |
| 17 | New trip (and edit) | Operator | ,  |
| 18 | Buses | Operator |  |
| 19 | Seat layouts | Operator |  |
| 20 | Routes and fares | Operator |  |
| 21 | Agents | Operator |  |
| 22 | Reports | Operator |  |

### Colours

The brand uses the Ghana flag colours. Ghana has no official colour standard for transport apps, and state buses have been painted in the national colours.

| Token | Hex | Used for |
| --- | --- | --- |
| `brand` | `#006B3D` | Flag green: buttons, your seat, the e-ticket, the logo |
| `gold` | `#FCD20F` | Flag gold: "Loading now" badges, live labels, the scan frame |
| `danger` | `#CF0921` | Flag red: rejected scans, failed payments |
| `ink` | `#16201C` | Text and dark headers |
| `canvas` | `#F6F5F1` | Page background |

Red is kept off the seat map on purpose. Red and green side by side are hard to tell apart for colour-blind passengers, so taken seats are grey. White on green (about 6.6:1) and white on red (about 5.6:1) both pass WCAG AA contrast. Gold always sits under dark text. Report chart bars use a darker gold,  (), because the flag gold is too light on white for thin marks; every chart also has a table view.

### Type

- **Archivo** (700, 800) for headings and prices
- **IBM Plex Sans** (400–600) for body text
- **IBM Plex Mono** (500, 600) for seat numbers, number plates and ticket codes

All tokens live in [client/src/index.css](client/src/index.css) as a Tailwind `@theme`, so classes like `bg-brand`, `text-muted` and `font-display` match the design exactly.

## Tech stack

| Part | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router 7 |
| QR codes | `qrcode.react` |
| Backend (planned) | NestJS, PostgreSQL with Prisma, Socket.IO (NestJS WebSocket gateway) for live seat updates |
| Payments (planned) | Paystack (mobile money and card) |

## Getting started

You need Node.js 20 or newer.

```bash
cd client
npm install
npm run dev
```

Open <http://localhost:5173>.

Other scripts:

```bash
npm run build      # typecheck and build to client/dist
npm run preview    # serve the production build
npm run typecheck  # types only
```

### Trying the flow

1. On the home page, choose how many **Passengers** (1–6) and press **Find buses**, or tap a bus under **Loading now**.
2. On **GR 4471-24** (Accra → Kumasi, bay 6), pick free seats: one per passenger, up to 6 per booking. Tap a seat again to drop it. One 5-minute hold covers all the seats you pick, and it starts with the first one.
3. Pay with any phone number, such as `024 000 0000`. The total is (fare + service fee) × seats.
4. The next page asks you to approve the prompt on your phone. Payments are simulated: press **I have approved it** to get your tickets, or **It did not work** to see the failed-payment page. No money moves.
5. You get one e-ticket per seat, each with its own scannable QR code. Each code works once at the bus door.

Sign in at `/signin` with any 9-digit Ghana number and any 6-digit code. **My tickets** then shows the demo account's upcoming and past trips, plus anything you booked.

Buses with fewer free seats than your passenger count show **Not enough seats**.

Staff sign in from the footer links (**Station agents**, **Operators**) with any email and a password of 6 or more characters.

- **Agents** land on the loading console. They can switch bay, sell a walk-in seat (cash or mobile money), scan a ticket and mark the bus departed.
- **Operators** land on the overview. The menu leads to Trips, Buses, Seat layouts, Routes and fares, Agents and Reports. Adding a bus, route, agent, layout or trip shows up in the lists straight away. Reports export a CSV.

## Frontend structure (atomic design)

```text
client/src/
├── components/
│   ├── atoms/        Smallest pieces: Button, Badge, Avatar, Dropdown, Icon, Logo, TextInput, ProgressBar, SeatButton, Card, Th/Td
│   ├── molecules/    Atoms combined: FormField, SegmentedControl, FilterChips, ChoiceCard, CodeInput, InlineFormCard, PageHeader, MiniSeatPlan, TripCard, HoldTimer, StatTile
│   ├── organisms/    Page sections: SiteHeader, SearchForm, SeatMap, PaymentForm, TicketCard, PassengerSignIn, WalkInSale, TripForm, ResponsiveTable, FleetLists, SalesChart
│   └── templates/    Page shells: PublicTemplate, BookingTemplate, AuthTemplate, AgentTemplate, OperatorTemplate, PassTemplate
├── pages/            Routes: templates filled with organisms and data (operator pages in pages/operator/)
├── app/              Routes and app state: Auth, Booking, Station (agent) and Operator contexts
├── data/             Shared types and mock data (stand-in for the API)
├── hooks/            useCountdown (seat hold timer)
└── lib/              Formatting (cedis, labels) and seat-layout helpers
```

The rule: each layer imports only from the layers below it. Pages compose templates and organisms; organisms compose molecules and atoms; atoms import nothing from `components/`.

On phones the layout follows the phone artboards. The header collapses to a menu button, the seat page gets a sticky "Continue to payment" bar, and every operator table becomes a list of cards. Tablets get an icon rail for the operator menu.

## What is mocked

Everything in [client/src/data/](client/src/data/) will come from the API:

- Trips, seat counts, fares and the service fee are sample values, not real prices.
- The seat hold timer runs in the browser. The server must own it, and hold all seats in a booking together, so two people cannot pay for the same seat.
- Payment approval is a choice of two buttons in test mode. Paystack webhooks will replace this.
- Sign-in accepts any number and code (passengers) or any email and password (staff). Nothing is checked or stored.
- Operator changes (new trips, buses, routes, agents, layouts, fares) live in memory and reset on reload.
- Report figures are generated sample data.
- The scan screen shows a sample valid and rejected result. The camera is not connected yet.
- Live updates are not wired up yet; "Updates live" labels mark where Socket.IO events will land.

## Roadmap

- [x] Design: 22 screens, each for desktop, tablet and phone
- [x] Frontend: all 22 screens, responsive, with mock data
- [ ] API: trips, buses, seat layouts, bookings, tickets (NestJS + Prisma + PostgreSQL)
- [ ] Seat holds with expiry on the server, and live seat updates over Socket.IO
- [ ] Paystack mobile money and card payments, in test mode first
- [ ] SMS tickets
- [ ] Camera QR scanning for agents, with one-time ticket check-in
- [ ] Real sign-in: SMS codes for passengers, password accounts for staff
- [ ] Docker setup (`Dockerfile` and `docker-compose.yml` are empty placeholders for now)

## Repository layout

```text
.
├── client/              React frontend
├── server/              NestJS API (not started)
├── Dockerfile           placeholder
└── docker-compose.yml   placeholder
```
