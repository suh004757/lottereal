// Renders month grids from buildMonthGrid() into plain DOM. Shared by the public
// short-term listing pages and the admin availability panel.
import { buildMonthGrid, calendarCopy } from './utils/shortStayAvailability.mjs';

export function renderCalendarMonths(container, { periods, today, locale = 'ko', months = 2, onDayClick = null, selected = [] }) {
  const copy = calendarCopy(locale);
  const [year, month] = today.split('-').map(Number);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < months; i += 1) {
    const monthIndex = (month - 1 + i) % 12;
    const grid = buildMonthGrid(year + Math.floor((month - 1 + i) / 12), monthIndex, periods, today);
    const table = document.createElement('table');
    table.className = 'stay-calendar__month';
    const caption = document.createElement('caption');
    caption.textContent = copy.month(grid.year, grid.monthIndex + 1);
    table.appendChild(caption);

    const head = document.createElement('tr');
    copy.weekdays.forEach((name) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = name;
      head.appendChild(th);
    });
    const thead = document.createElement('thead');
    thead.appendChild(head);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    grid.weeks.forEach((week) => {
      const tr = document.createElement('tr');
      week.forEach((cell) => {
        const td = document.createElement('td');
        if (cell) {
          const state = cell.past ? 'past' : (cell.blocked ? 'blocked' : 'open');
          td.className = `stay-calendar__day stay-calendar__day--${state}`;
          if (cell.today) td.classList.add('stay-calendar__day--today');
          if (selected.includes(cell.date)) td.classList.add('stay-calendar__day--selected');
          td.dataset.date = cell.date;
          if (onDayClick && !cell.past) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = String(cell.dayOfMonth);
            button.setAttribute('aria-label', `${cell.date} ${cell.blocked ? copy.legend.blocked : copy.legend.open}`);
            button.addEventListener('click', () => onDayClick(cell.date));
            td.appendChild(button);
          } else {
            td.textContent = String(cell.dayOfMonth);
            if (!cell.past) td.title = cell.blocked ? copy.legend.blocked : copy.legend.open;
          }
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    fragment.appendChild(table);
  }

  const legend = document.createElement('p');
  legend.className = 'stay-calendar__legend';
  [['open', copy.legend.open], ['blocked', copy.legend.blocked]].forEach(([state, label]) => {
    const item = document.createElement('span');
    item.className = `stay-calendar__key stay-calendar__key--${state}`;
    item.textContent = label;
    legend.appendChild(item);
  });
  fragment.appendChild(legend);
  container.replaceChildren(fragment);
}
