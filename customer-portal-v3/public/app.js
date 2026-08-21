const testInventory = [
  { id: 'R-TEST1', type: 'refrigerator', title: 'Refrigerator', price: 295, status: 'Available' },
  { id: 'W-TEST2', type: 'washer', title: 'Top-Load Washer', price: 265, status: 'Available' },
  { id: 'D-TEST3', type: 'dryer', title: 'Electric Dryer', price: 195, status: 'Available' },
  { id: 'S-TEST4', type: 'stove', title: 'Electric Stove', price: 265, status: 'Available' }
];

const grid = document.querySelector('#inventory-grid');
const filters = document.querySelectorAll('.filter');

function renderInventory(items) {
  grid.innerHTML = items.map(item => `
    <article class="appliance-card" data-type="${item.type}">
      <div class="appliance-photo">PHOTO</div>
      <div class="appliance-body">
        <h3>${item.title}</h3>
        <div class="appliance-meta">${item.id} · ${item.status}</div>
        <div class="price">$${item.price}</div>
      </div>
    </article>
  `).join('');
}

filters.forEach(button => {
  button.addEventListener('click', () => {
    filters.forEach(filter => filter.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.filter;
    renderInventory(filter === 'all' ? testInventory : testInventory.filter(item => item.type === filter));
  });
});

renderInventory(testInventory);
