/* ── Kopfleiste (Desktop-Dropdowns) und Mobile-Navigation ── */

import { el } from './dom';
import { createDropdown } from './dropdown';
import { buildMobileNav } from './mobile-nav';
import type { Project } from '../domain/types';

export interface ToolbarHandlers {
  newProject: () => void;
  openProjects: () => void;
  saveZip: () => void;
  loadZip: () => void;
  openSnapshots: () => void;
  openTrash: () => void;
  openDocuments: () => void;
  openInstandsetzungsreport: () => void;
  openProjectExport: () => void;
  openMaterialExport: () => void;
  newTask: () => void;
  toggleEditMode: () => void;
}

export interface ToolbarOptions {
  project: Project | null;
  editMode: boolean;
  handlers: ToolbarHandlers;
}

interface MenuAction {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'danger';
}

interface MenuGroup {
  label: string;
  icon: string;
  items: MenuAction[];
}

/** Die Menüstruktur wird von Desktop-Toolbar und Mobile-Nav geteilt. */
function menuGroups(opts: ToolbarOptions): MenuGroup[] {
  const { project, editMode, handlers } = opts;
  const hasProject = project !== null;

  const groups: MenuGroup[] = [
    {
      label: 'Projekt',
      icon: 'folder',
      items: [
        { label: 'Neues Projekt', icon: 'folder-plus', onClick: handlers.newProject },
        {
          label: 'Meine Projekte',
          icon: 'folder',
          onClick: handlers.openProjects,
        },
        {
          label: 'Speichern',
          icon: 'download',
          onClick: handlers.saveZip,
          disabled: !hasProject,
        },
        { label: 'Laden', icon: 'upload', onClick: handlers.loadZip },
        {
          label: 'Sicherungsstände',
          icon: 'history',
          onClick: handlers.openSnapshots,
          disabled: !hasProject,
        },
        {
          label: 'Gelöschte Aufgaben',
          icon: 'trash',
          onClick: handlers.openTrash,
          disabled: !hasProject,
        },
      ],
    },
  ];

  if (project) {
    groups.push(
      {
        label: 'Dokumente',
        icon: 'paperclip',
        items: [
          { label: 'Unterlagen', icon: 'paperclip', onClick: handlers.openDocuments },
          {
            label: 'Instandsetzungsreport',
            icon: 'presentation',
            onClick: handlers.openInstandsetzungsreport,
          },
          {
            label: 'Projekt Export',
            icon: 'file-text',
            onClick: handlers.openProjectExport,
          },
          {
            label: 'Material Export',
            icon: 'clipboard',
            onClick: handlers.openMaterialExport,
          },
        ],
      },
      {
        label: 'Aufgaben',
        icon: 'list',
        items: [
          { label: 'Neue Aufgabe', icon: 'plus', onClick: handlers.newTask },
          {
            label: editMode ? 'Fertig' : 'Editieren',
            icon: editMode ? 'check' : 'pencil',
            onClick: handlers.toggleEditMode,
          },
        ],
      },
    );
  }

  return groups;
}

export function buildToolbar(opts: ToolbarOptions): HTMLElement {
  const bar = el('header', { class: 'toolbar' });
  const brand = el('div', { class: 'toolbar-brand' });
  const logo = el('span', { class: 'brand-logo' }, [
    el('img', { class: 'brand-logo-img', src: 'favicon.svg', alt: 'LDC Planer Logo' }),
  ]);
  const brandText = el('div', { class: 'brand-text' });

  if (opts.project) {
    const project = opts.project;
    brandText.appendChild(el('span', { class: 'brand-kicker' }, ['LDC Planer']));
    brandText.appendChild(
      el('h1', { class: 'project-title', title: project.name }, [project.name]),
    );
    const openCount = project.tasks.filter((t) => t.status !== 'behoben').length;
    brandText.appendChild(
      el('span', { class: 'project-sub' }, [
        project.location,
        ` · ${project.tasks.length} ${project.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}`,
        ...(openCount > 0 ? [` · ${openCount} offen`] : []),
      ]),
    );
  } else {
    brandText.appendChild(el('h1', { class: 'brand-title' }, ['LDC Planer']));
  }

  brand.appendChild(logo);
  brand.appendChild(brandText);
  bar.appendChild(brand);

  const actions = el('div', { class: 'toolbar-actions' });
  for (const group of menuGroups(opts)) {
    actions.appendChild(
      createDropdown({
        label: group.label,
        icon: group.icon,
        items: group.items,
      }),
    );
  }
  bar.appendChild(actions);
  return bar;
}

export function buildMobileNavigation(opts: ToolbarOptions): HTMLElement {
  return buildMobileNav(
    menuGroups(opts).map((group) => ({
      label: group.label,
      icon: group.icon,
      items: group.items.map((item) => ({
        label: item.label,
        icon: item.icon,
        onClick: item.onClick,
        disabled: item.disabled,
        primary: item.kind === 'primary',
        danger: item.kind === 'danger',
      })),
    })),
  );
}
