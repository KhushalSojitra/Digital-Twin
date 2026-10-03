# OominiEye — Next-Gen Command & Control (prototype)

Interactive prototype of the OominiEye command-and-control console: multi-account sign-in, an iOS-flavoured Material UI shell, and an **Earth** module that plots combo cameras on a satellite globe and opens a coupled 360° + PTZ live view. Ticket management is dialog-based — no permanent right-side ticket panel.

## Stack

- React 19 + TypeScript + Vite
- Material UI (components, theming, light/dark mode)
- MapLibre GL (globe projection, Esri World Imagery tiles) for the Earth view
- three.js for the equirectangular 360° / PTZ live renders

## Run locally

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:4731>.

Other scripts: `npm run build` (type-check + production bundle), `npm run preview`, `npm run lint`.

## Demo accounts

| Username   | Password       | Role          |
| ---------- | -------------- | ------------- |
| `admin`    | `Admin@123`    | Administrator |
| `operator` | `Operator@123` | Operator      |
| `viewer`   | `Viewer@123`   | Viewer        |

People used for assignment and watchers:

- Ava Sharma
- Michael Reed
- Sarah Wilson

## Earth module

- On open, the globe flies to the home location (New York Harbor). Each site is a **single 360 + PTZ combo** pin — not separate 360 and PTZ markers.
- The Earth imagery loader clears when satellite tiles are ready. If tiles fail, an error state is shown instead of an endless spinner.
- Pick a camera from the **Camera** dropdown (360°, PTZ, or combo) or click a combo pin to open live view.
- Top-right: **Improvements** (icon only) and **Ticket management** (Manage Tickets, Trends, Filter, Enable/Disable ticket view).
- Filter supports Status, Camera, Creator, Assignee, and Date Range.
- Manage Tickets is the only place **Go to location** appears. Clicking a ticket marker opens a popup dialog.

## Live view

- Header keeps **Camera Name** (plus Earth back / close).
- Left-click or tap aims the paired camera at that point. Right-click / two-finger click (`contextmenu`) opens **Create Ticket**. On a touch screen, hold to create a ticket.
- Ticket management sits beside Improvements (Manage Tickets, Trends, Filter, Enable/Disable ticket view). Manage Tickets lists tickets for the opened camera and hides the Camera filter.
- The 360° and PTZ pair stay coupled in a picture-in-picture window; swap, pan, tilt, zoom and home still drive the main camera.

## Tickets

Ticket markers are ticket-shaped and keep the existing status colours: red = To Do, amber = In Progress, green = Done, blue = Accepted, grey = Failed.

Create Ticket fields: coordinates (from the click), camera name, auto ticket ID, title, description, priority, assignee, ticketing platform, and a single **Capture snapshot as proof** checkbox when Administration allows the creator to choose. New tickets open as **To Do**. Status is not shown during creation.

Open ticket shows ID, title, description, priority, creator, assignee, status, coordinates, camera name, before/after images when available, and activity. Watchers use **Add watcher** only — Follow Ticket and Share Ticket are gone.

## Administration

Subtabs: **User Management**, **Device Management**, and **Ticket Management**.

Jira is the built-in default platform: it can be edited and set as default, but it cannot be deleted. Each third-party integration has its own Live View ticket-age window, stored-data window, snapshot policy (always / creator chooses / disabled), and the full connection, payload, mapping, webhook, and polling configuration. **Add integration** creates ServiceNow, OpenProject, Custom API, or Client Internal System connections.

The camera inventory lives in `src/data/cameras.ts`. Panoramas in `public/panoramas/` are CC0 assets from [Poly Haven](https://polyhaven.com/) standing in for live streams.
