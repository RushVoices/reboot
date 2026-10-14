// Starting points: your own free version of an app people pay a subscription
// for. The product's logo (from Simple Icons) and name only tell people what
// they'll get; the build prompt asks for an original name and look, and the
// generated app never uses the product's branding.

import {
  siAirtable, siDiscord, siDuolingo, siFigma, siHeadspace, siLinear,
  siMiro, siNotion, siSpotify, siTodoist, siTrello, siTypeform,
  type SimpleIcon,
} from "simple-icons";

export interface Preset {
  title: string;
  /** The paid product it replaces. */
  logo: SimpleIcon;
  prompt: string;
}

const P = (title: string, logo: SimpleIcon, prompt: string): Preset => ({ title, logo, prompt });

export const PRESETS: Preset[] = [
  P("Design tool", siFigma,
    "A design tool like Figma: an infinite canvas with pan and zoom, frames, rectangles, ellipses, lines, text and images; select, move, resize and rotate with handles; a layers panel; a properties panel for fill, stroke, radius, opacity and font; alignment and snapping guides; group/ungroup; undo/redo; and export the selection or a frame to PNG or SVG. Start with an example frame on the canvas. Keep the document in localStorage."),
  P("Docs & notes", siNotion,
    "A notes and docs app like Notion: a sidebar of nested pages I can create, rename, reorder and delete; a block editor where typing / opens a menu for headings, to-do checkboxes, bullet and numbered lists, quotes, code, dividers and callouts; drag handles to reorder blocks; page icons and cover colors; search across pages; and a simple table database view. Seed a few example pages. Keep everything in localStorage."),
  P("Music player", siSpotify,
    "A music player like Spotify: add audio files from my computer, a library with songs, albums and artists read from file names, playlists I can create and edit, a now-playing bar with play/pause, seek, next/previous, shuffle, repeat and volume, a queue, and an audio visualizer using the Web Audio API. Include a few short generated demo tones so it works before I add music."),
  P("Chat app", siDiscord,
    "A chat app like Discord: a server list down the left, text channels per server, a message feed with avatars, names, timestamps, replies, emoji reactions and message editing, a member list with online status, custom profile themes and animated avatars (the extras people normally pay for), and a composer with Enter to send. Seed two servers with realistic conversations from a few made-up people, and let me create servers and channels. Keep everything in localStorage."),
  P("Issue tracker", siLinear,
    "An issue tracker like Linear: issues with IDs, titles, descriptions, status (Backlog, Todo, In Progress, Done), priority, labels, assignee and estimates; a fast list view grouped by status and a board view with drag and drop; cycles (sprints) with progress; a command palette on Cmd/Ctrl+K; keyboard shortcuts for creating and moving issues; and filters. Seed a realistic product team's backlog. Keep everything in localStorage."),
  P("Kanban boards", siTrello,
    "A kanban app like Trello: multiple boards, lists and cards with drag and drop between lists; card details with description, checklists, labels, due dates, cover colors and comments; board backgrounds; filters by label and due date; and unlimited boards and power-up style extras like a calendar view of due dates (the parts people normally pay for). Seed a sample board. Keep everything in localStorage."),
  P("To-do list", siTodoist,
    "A to-do app like Todoist: quick add with natural language dates (\"tomorrow 5pm\", \"every monday\"), projects and sections, priorities, labels, recurring tasks, Today and Upcoming views, reminders shown in the page, a productivity streak and karma chart, and themes. Seed a realistic week of tasks. Keep everything in localStorage."),
  P("Database", siAirtable,
    "A spreadsheet-database app like Airtable: bases with tables, typed fields (text, number, single select, multi select, checkbox, date, attachment link, rating), a grid view with inline editing, sorting, filtering and grouping, a kanban view by any single-select field, a gallery view, and CSV import and export. Seed a content-calendar base. Keep everything in localStorage."),
  P("Whiteboard", siMiro,
    "An online whiteboard like Miro: an infinite canvas with sticky notes in several colors, shapes, connectors with arrows, freehand pen, text, and frames; templates for a retro, a mind map and a user journey; pan, zoom, select, multi-select, duplicate, undo/redo, a minimap, and export to PNG. Seed one board with a filled-in retro. Keep everything in localStorage."),
  P("Form builder", siTypeform,
    "A form builder like Typeform: build forms with short text, long text, multiple choice, rating, yes/no, email and date questions; logic jumps; a one-question-at-a-time player with smooth transitions and keyboard navigation; themes; a responses table and a summary chart per question; and CSV export. Seed one example survey with sample responses. Keep everything in localStorage."),
  P("Language lessons", siDuolingo,
    "A language-learning app like Duolingo with everything people pay Super for: a lesson path for Spanish with units, lessons that mix translate, match pairs, fill in the blank and listen-and-type exercises (use the browser's speech synthesis), XP, streaks, hearts that never run out, mistake review, and a practice mode. Include at least 60 real Spanish words and phrases. Keep progress in localStorage."),
  P("Meditation", siHeadspace,
    "A meditation app like Headspace with the paid library unlocked: guided breathing sessions with an animated breathing circle, timed meditations from 3 to 30 minutes with interval bells made with the Web Audio API, sleep sounds (rain, waves, brown noise generated in the browser), a mood check-in, streaks and a session history. Keep progress in localStorage."),
];
