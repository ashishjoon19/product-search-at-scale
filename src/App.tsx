import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';

type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  price: number;
  rating: number;
  reviews: number;
  stock: number;
  sku: string;
  icon: string;
  specs: string[];
};

type Page = 'Home' | 'Search results' | 'Product detail' | 'Catalog manager' | 'Search Lab';

const seedProducts: Product[] = [
  { id: 'p-101', name: 'Dell Latitude 5440', brand: 'Dell', category: 'Laptops', description: '14-inch business laptop · Intel Core i7 · 16 GB RAM · 512 GB SSD', price: 74990, rating: 4.8, reviews: 128, stock: 24, sku: 'LAT-5440-I7-16', icon: '💻', specs: ['Intel Core i7-1355U', '16 GB DDR5', '14-inch FHD', '512 GB SSD'] },
  { id: 'p-102', name: 'Sony WH-1000XM5 Wireless', brand: 'Sony', category: 'Audio', description: 'Wireless noise-cancelling headphones · 30-hour battery', price: 29990, rating: 4.9, reviews: 96, stock: 16, sku: 'SONY-XM5-BLK', icon: '🎧', specs: ['Wireless Bluetooth', 'Active noise cancelling', '30-hour battery', 'USB-C charging'] },
  { id: 'p-103', name: 'LG UltraFine 27-inch 4K', brand: 'LG', category: 'Monitors', description: '27-inch UHD display · USB-C · height-adjustable stand', price: 31499, rating: 4.6, reviews: 54, stock: 9, sku: 'LG-27UQ850', icon: '🖥️', specs: ['27-inch IPS', '3840 × 2160', 'USB-C 90 W', 'Height adjustable'] },
  { id: 'p-104', name: 'Keychron K2 Wireless Mechanical', brand: 'Keychron', category: 'Accessories', description: 'Compact wireless mechanical keyboard · white backlight', price: 8499, rating: 4.7, reviews: 81, stock: 31, sku: 'KEY-K2-WHT', icon: '⌨️', specs: ['75% layout', 'Bluetooth 5.1', 'Hot-swappable', 'White backlight'] },
  { id: 'p-105', name: 'Dell Latitude 7440', brand: 'Dell', category: 'Laptops', description: '14-inch business laptop · Intel Core i7 · 16 GB RAM · 1 TB SSD', price: 108990, rating: 4.7, reviews: 62, stock: 7, sku: 'LAT-7440-I7-16', icon: '💻', specs: ['Intel Core i7-1365U', '16 GB DDR5', '14-inch FHD+', '1 TB SSD'] },
  { id: 'p-106', name: 'Dell Latitude 3540', brand: 'Dell', category: 'Laptops', description: '15.6-inch laptop · Intel Core i5 · 16 GB RAM · 512 GB SSD', price: 58490, rating: 4.5, reviews: 45, stock: 13, sku: 'LAT-3540-I5-16', icon: '💻', specs: ['Intel Core i5-1335U', '16 GB DDR4', '15.6-inch FHD', '512 GB SSD'] },
  { id: 'p-107', name: 'Logitech MX Master 3S', brand: 'Logitech', category: 'Accessories', description: 'Wireless ergonomic mouse · 8K DPI · USB-C', price: 8995, rating: 4.8, reviews: 112, stock: 0, sku: 'LOGI-MXM3S', icon: '🖱️', specs: ['8K DPI sensor', 'Bluetooth + Bolt', 'USB-C charging', 'Quiet clicks'] },
  { id: 'p-108', name: 'Bose QuietComfort Ultra', brand: 'Bose', category: 'Audio', description: 'Immersive audio headphones · noise cancelling · 24-hour battery', price: 35900, rating: 4.6, reviews: 39, stock: 11, sku: 'BOSE-QCU-BLK', icon: '🎧', specs: ['Spatial audio', 'Noise cancelling', '24-hour battery', 'Bluetooth 5.3'] },
];

const categories = [
  { name: 'Computers', icon: '💻' }, { name: 'Audio', icon: '🎧' }, { name: 'Accessories', icon: '⌨️' }, { name: 'Monitors', icon: '🖥️' }, { name: 'Home office', icon: '🏠' },
];
const money = (price: number) => `₹${price.toLocaleString('en-IN')}`;
function withinOneEdit(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (i < left.length || j < right.length ? 1 : 0) <= 1;
}
function textMatches(query: string, text: string): boolean {
  const terms = query.split(/\s+/).filter(Boolean);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return terms.every((term) => text.includes(term) || words.some((word) => word.startsWith(term) || (term.length > 3 && withinOneEdit(term, word))));
}

function App() {
  const [page, setPage] = useState<Page>('Home');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product>(seedProducts[0]);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState('Relevance');
  const [products, setProducts] = useState(seedProducts);
  const [savedNotice, setSavedNotice] = useState('');
  const [searchBackend, setSearchBackend] = useState('PostgreSQL · full-text + indexes');
  const [datasetSize, setDatasetSize] = useState('1,000,000 products');
  const [benchmarkNotice, setBenchmarkNotice] = useState('No benchmark run yet. Results will appear here after a real run.');
  const [form, setForm] = useState({ name: '', brand: '', category: 'Laptops', price: '', sku: '', description: '' });

  const matches = useMemo(() => {
    const normalized = submittedQuery.trim().toLocaleLowerCase();
    const list = products.filter((product) => {
      const searchable = `${product.name} ${product.brand} ${product.category} ${product.description}`.toLocaleLowerCase();
      const queryMatch = !normalized || normalized === product.sku.toLowerCase() || textMatches(normalized, searchable);
      const categoryMatch = categoryFilter === 'All' || product.category === categoryFilter;
      const brandMatch = brandFilter === 'All' || product.brand === brandFilter;
      return queryMatch && categoryMatch && brandMatch && (!availableOnly || product.stock > 0);
    });
    if (sort === 'Price: low to high') list.sort((a, b) => a.price - b.price);
    if (sort === 'Price: high to low') list.sort((a, b) => b.price - a.price);
    return list;
  }, [products, submittedQuery, categoryFilter, brandFilter, availableOnly, sort]);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return products.filter((product) => product.sku.toLowerCase() === normalized || textMatches(normalized, `${product.name} ${product.brand} ${product.category}`.toLowerCase())).slice(0, 4);
  }, [products, query]);

  function search(value = query) {
    setSubmittedQuery(value.trim());
    setQuery(value);
    setCategoryFilter('All');
    setBrandFilter('All');
    setPage('Search results');
  }
  function openProduct(product: Product) {
    setSelectedProduct(product);
    setPage('Product detail');
  }
  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created: Product = {
      id: `p-${Date.now()}`, name: form.name, brand: form.brand, category: form.category,
      description: form.description, price: Number(form.price), rating: 0, reviews: 0,
      stock: 10, sku: form.sku, icon: form.category === 'Audio' ? '🎧' : form.category === 'Monitors' ? '🖥️' : '💻', specs: [],
    };
    setProducts((current) => [created, ...current]);
    setSavedNotice(`${created.name} saved to the local demo catalog. Database and search sync will be connected in a later milestone.`);
    setForm({ name: '', brand: '', category: 'Laptops', price: '', sku: '', description: '' });
  }

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-main">
        <button className="brand" type="button" onClick={() => setPage('Home')} aria-label="Foundry home"><span className="brand-mark">F</span><span>Foundry</span><span className="brand-sub">CATALOG</span></button>
        <div className="global-search-wrap">
          <form className="global-search" onSubmit={(event) => { event.preventDefault(); search(); }}>
            <span aria-hidden="true" className="search-icon">⌕</span>
            <input aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setSavedNotice('')} placeholder="Search products, brands, and categories" />
            {query && <button type="button" className="clear-search" aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
            <button className="search-button" type="submit">Search</button>
          </form>
          {query && page !== 'Search results' && suggestions.length > 0 && <div className="suggestion-popover">
            {suggestions.map((product) => <button type="button" key={product.id} className="suggestion-row" onClick={() => openProduct(product)}><span className="suggestion-art">{product.icon}</span><span><strong>{product.name}</strong><small>{product.category} · {money(product.price)}</small></span><span className="suggestion-enter">↵</span></button>)}
            <button type="button" className="suggestion-all" onClick={() => search()}>See all results for “{query}” →</button>
          </div>}
        </div>
        <button className="account-button" type="button" aria-label="Account menu">AM</button>
      </div>
      <nav className="category-nav" aria-label="Product categories">
        {categories.map((category) => <button type="button" key={category.name} onClick={() => { setCategoryFilter(category.name === 'Computers' ? 'Laptops' : category.name === 'Home office' ? 'All' : category.name); setBrandFilter('All'); setSubmittedQuery(''); setPage('Search results'); }}>{category.name}</button>)}
        <span className="generated-note">Demo catalog · generated data</span>
      </nav>
    </header>

    <main>
      {page === 'Home' && <Home products={products} onSearch={search} onOpenProduct={openProduct} onCategory={(name) => { setCategoryFilter(name); setBrandFilter('All'); setSubmittedQuery(''); setPage('Search results'); }} />}
      {page === 'Search results' && <Results query={submittedQuery} results={matches} category={categoryFilter} setCategory={setCategoryFilter} brand={brandFilter} setBrand={setBrandFilter} availableOnly={availableOnly} setAvailableOnly={setAvailableOnly} sort={sort} setSort={setSort} onOpenProduct={openProduct} />}
      {page === 'Product detail' && <ProductDetail product={selectedProduct} onBack={() => setPage('Search results')} />}
      {page === 'Catalog manager' && <CatalogManager products={products} form={form} setForm={setForm} onSave={saveProduct} notice={savedNotice} />}
      {page === 'Search Lab' && <SearchLab backend={searchBackend} setBackend={setSearchBackend} datasetSize={datasetSize} setDatasetSize={setDatasetSize} notice={benchmarkNotice} onRun={() => setBenchmarkNotice('Benchmark runner is not connected yet. Numbers are intentionally hidden until the same workload is measured for both backends.')} />}
    </main>

    <footer className="site-footer"><span>Foundry Catalog <span className="muted">· Search engineering demo</span></span><nav aria-label="Project areas">{(['Home', 'Catalog manager', 'Search Lab'] as Page[]).map((item) => <button type="button" key={item} className={page === item ? 'footer-link active' : 'footer-link'} onClick={() => setPage(item)}>{item}</button>)}</nav></footer>
  </div>;
}

function Home({ products, onSearch, onOpenProduct, onCategory }: { products: Product[]; onSearch: (value: string) => void; onOpenProduct: (product: Product) => void; onCategory: (name: string) => void }) {
  const [heroQuery, setHeroQuery] = useState('');
  return <div className="page-content">
    <section className="hero-panel"><div className="hero-copy"><div className="eyebrow">Find it faster</div><h1>Search less.<br />Find the right gear.</h1><p>Helpful suggestions, useful filters, and product details you can trust as the catalog grows.</p><form className="hero-search" onSubmit={(event) => { event.preventDefault(); onSearch(heroQuery); }}><input aria-label="Search the catalog" value={heroQuery} onChange={(event) => setHeroQuery(event.target.value)} placeholder="Try “wireless headphones”" /><button className="button-primary" type="submit">Search</button></form></div><div className="hero-visual" aria-hidden="true"><span className="hero-product">💻</span><span className="hero-chip">Popular this week</span></div></section>
    <div className="section-heading"><div><h2>Browse categories</h2><p>Explore the catalog</p></div></div>
    <section className="category-grid">{categories.map((item) => <button className="category-tile" type="button" key={item.name} onClick={() => onCategory(item.name === 'Computers' ? 'Laptops' : item.name === 'Home office' ? 'All' : item.name)}><span>{item.icon}</span><strong>{item.name}</strong><span className="tile-arrow">↗</span></button>)}</section>
    <div className="section-heading"><div><h2>Popular in the catalog</h2><p>Curated from the demo catalog</p></div><button className="text-button" type="button" onClick={() => onSearch('')}>View all products →</button></div>
    <section className="product-grid">{products.slice(0, 4).map((product) => <ProductCard product={product} key={product.id} onOpen={() => onOpenProduct(product)} />)}</section>
  </div>;
}

function ProductCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
  return <button className="product-card" type="button" onClick={onOpen}><span className="product-image"><span className="product-symbol">{product.icon}</span>{product.reviews > 90 && <span className="popular-tag">Popular</span>}</span><span className="product-meta">{product.brand} · {product.category}</span><strong className="product-title">{product.name}</strong><span className="rating">★★★★★ <span>({product.reviews})</span></span><span className="product-price">{money(product.price)}</span><span className={product.stock ? 'stock-label' : 'stock-label out'}>{product.stock ? 'In stock' : 'Currently unavailable'}</span></button>;
}

function Results({ query, results, category, setCategory, brand, setBrand, availableOnly, setAvailableOnly, sort, setSort, onOpenProduct }: { query: string; results: Product[]; category: string; setCategory: (value: string) => void; brand: string; setBrand: (value: string) => void; availableOnly: boolean; setAvailableOnly: (value: boolean) => void; sort: string; setSort: (value: string) => void; onOpenProduct: (product: Product) => void }) {
  const filterGroups = [
    { title: 'Category', options: ['All', 'Laptops', 'Audio', 'Accessories', 'Monitors'] },
    { title: 'Brand', options: ['All', 'Dell', 'Sony', 'LG', 'Keychron'] },
  ];
  const filtered = results;
  return <div className="page-content results-page"><div className="breadcrumb">Catalog <span>/</span> Search</div><div className="results-title"><div><div className="eyebrow">Search results</div><h1>{query ? <>Results for “{query}”</> : 'All products'}</h1><p>{filtered.length} products found in this catalog</p></div><label className="sort-control">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option>Relevance</option><option>Price: low to high</option><option>Price: high to low</option></select></label></div>
    <div className="results-layout"><aside className="filter-sidebar"><div className="filter-head"><strong>Filters</strong><button type="button" className="text-button" onClick={() => { setCategory('All'); setBrand('All'); setAvailableOnly(false); }}>Clear all</button></div>{filterGroups.map((group) => <fieldset className="filter-group" key={group.title}><legend>{group.title}</legend>{group.options.map((option) => <label className="filter-option" key={option}><input type="radio" name={group.title} checked={group.title === 'Category' ? category === option : brand === option} onChange={() => group.title === 'Category' ? setCategory(option) : setBrand(option)} />{option === 'All' ? `All ${group.title.toLowerCase()}s` : option}<span>{option === 'Laptops' ? '42' : option === 'Audio' ? '28' : option === 'Dell' ? '16' : option === 'All' ? '—' : '12'}</span></label>)}</fieldset>}<fieldset className="filter-group"><legend>Availability</legend><label className="filter-option"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />In stock now</label></fieldset><fieldset className="filter-group"><legend>Price range</legend><div className="price-range"><span>₹0</span><span>₹1,50,000</span></div><input className="range-input" type="range" min="0" max="150000" aria-label="Maximum price" /></fieldset></aside>
      <section className="result-list" aria-label="Matching products">{filtered.length === 0 ? <div className="empty-state"><span>⌕</span><h2>No matching products</h2><p>Try a shorter query or clear a filter to broaden your search.</p></div> : filtered.map((product) => <article className="result-row" key={product.id}><button className="result-image" type="button" onClick={() => onOpenProduct(product)}>{product.icon}</button><div className="result-copy"><span className="product-meta">{product.brand} · {product.category}</span><button type="button" className="result-name" onClick={() => onOpenProduct(product)}>{product.name}</button><p>{product.description}</p><span className={product.stock ? 'stock-label' : 'stock-label out'}>{product.stock ? '✓ In stock' : 'Currently unavailable'}</span></div><div className="result-actions"><strong>{money(product.price)}</strong><button className="button-secondary" type="button" onClick={() => onOpenProduct(product)}>View product</button></div></article>)}</section>
    </div>
  </div>;
}

function ProductDetail({ product, onBack }: { product: Product; onBack: () => void }) {
  const [added, setAdded] = useState(false);
  return <div className="page-content detail-page"><div className="breadcrumb"><button type="button" onClick={onBack}>Search results</button><span>/</span>{product.category}<span>/</span>{product.brand}</div><div className="detail-layout"><div><div className="detail-image"><span>{product.icon}</span><span className="detail-image-label">Product image · demo catalog</span></div><div className="thumb-strip"><span>{product.icon}</span><span>Specs</span><span>Details</span></div></div><section className="detail-info"><div className="eyebrow">{product.brand} · {product.category}</div><h1>{product.name}</h1><p className="sku-line">SKU: {product.sku}</p><div className="rating detail-rating">★★★★★ <span>{product.rating || '—'} · {product.reviews} reviews</span></div><div className="detail-price">{money(product.price)}</div><p className="freshness-note"><span>✓</span> Current price and availability from the product record</p><div className="purchase-box"><strong className={product.stock ? 'stock-label' : 'stock-label out'}>{product.stock ? 'In stock' : 'Currently unavailable'}</strong><p>{product.stock ? `${product.stock} available in this demo catalog.` : 'This item is temporarily out of stock.'}</p><button className="button-primary" type="button" disabled={!product.stock} onClick={() => setAdded(true)}>{added ? 'Added to cart ✓' : 'Add to cart'}</button><button className="button-secondary save-button" type="button">♡ Save for later</button></div><h2 className="spec-heading">Key specifications</h2><dl className="spec-list">{product.specs.map((spec, index) => <div key={spec}><dt>{['Processor / feature', 'Memory / connection', 'Display / battery', 'Storage / charging'][index % 4]}</dt><dd>{spec}</dd></div>)}</dl></section></div></div>;
}

function CatalogManager({ products, form, setForm, onSave, notice }: { products: Product[]; form: { name: string; brand: string; category: string; price: string; sku: string; description: string }; setForm: Dispatch<SetStateAction<{ name: string; brand: string; category: string; price: string; sku: string; description: string }>>; onSave: (event: FormEvent<HTMLFormElement>) => void; notice: string }) {
  return <div className="page-content manager-page"><div className="manager-title"><div><div className="eyebrow">Internal tool</div><h1>Catalog manager</h1><p>Manage product records and see whether the search index has caught up.</p></div><div className="sync-summary"><span className="sync-dot" /> Index status <strong>Demo mode</strong></div></div><div className="manager-layout"><form className="manager-form" onSubmit={onSave}><div className="panel-heading"><h2>Add a product</h2><p>Product data will be stored in PostgreSQL once the API is connected.</p></div><label>Product name<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Dell Latitude 5440" /></label><div className="form-two"><label>Brand<input required value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} placeholder="Brand" /></label><label>Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}><option>Laptops</option><option>Audio</option><option>Accessories</option><option>Monitors</option></select></label></div><div className="form-two"><label>SKU<input required value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} placeholder="Unique SKU" /></label><label>Price (INR)<input required type="number" min="1" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} placeholder="74990" /></label></div><label>Description<input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Short product description" /></label>{notice && <div className="notice" role="status">{notice}</div>}<button className="button-primary" type="submit">Save product</button></form><section className="catalog-table-panel"><div className="panel-heading table-heading"><div><h2>Recent catalog records</h2><p>Search index status is a UI placeholder until the sync worker is implemented.</p></div><span className="record-count">{products.length} records</span></div><div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Search sync</th></tr></thead><tbody>{products.slice(0, 7).map((product, index) => <tr key={product.id}><td><span className="table-product-icon">{product.icon}</span><strong>{product.name}</strong><small>{product.brand}</small></td><td>{product.sku}</td><td>{money(product.price)}</td><td><span className={index === 2 ? 'sync-status queued' : 'sync-status'}><i />{index === 2 ? 'Demo queued' : 'Demo current'}</span></td></tr>)}</tbody></table></div></section></div></div>;
}

function SearchLab({ backend, setBackend, datasetSize, setDatasetSize, notice, onRun }: { backend: string; setBackend: (value: string) => void; datasetSize: string; setDatasetSize: (value: string) => void; notice: string; onRun: () => void }) {
  return <div className="page-content lab-page"><div className="eyebrow">Engineering view</div><h1>Search Lab</h1><p>Compare search speed, relevance, and update freshness using repeatable workloads.</p><section className="lab-toolbar"><label>Search backend<select value={backend} onChange={(event) => setBackend(event.target.value)}><option>PostgreSQL · full-text + indexes</option><option>Meilisearch</option><option>Elasticsearch</option></select></label><label>Catalog size<select value={datasetSize} onChange={(event) => setDatasetSize(event.target.value)}><option>10,000 products</option><option>100,000 products</option><option>1,000,000 products</option><option>5,000,000 products</option></select></label><label>Workload<select><option>Mixed shopper queries</option><option>Autocomplete heavy</option><option>Typo tolerance</option><option>Filtered search</option></select></label><button className="button-primary" type="button" onClick={onRun}>Run benchmark</button></section><div className="lab-message" role="status">{notice}</div><div className="lab-metrics"><Metric title="p95 search latency" value="— ms" note="Waiting for measured run" /><Metric title="Write-to-search delay" value="— sec" note="Database commit to search visibility" /><Metric title="Request error rate" value="— %" note="Across the selected workload" /></div><section className="chart-panel"><div className="chart-heading"><div><h2>Latency as catalog grows</h2><p>p95 response time · milliseconds</p></div><span className="chart-empty">No benchmark selected</span></div><div className="chart-placeholder"><div className="chart-axis"><span>Higher latency</span><span>Lower latency</span></div><div className="chart-columns"><ChartGroup label="10K products" first={62} second={35} /><ChartGroup label="100K products" first={84} second={48} /><ChartGroup label="1M products" first={100} second={58} /></div></div><div className="chart-legend"><span><i className="legend-dot baseline" />Baseline</span><span><i className="legend-dot optimized" />Compared backend</span><span className="muted">Illustrative shapes only — not measured results</span></div></section><div className="lab-footnote"><strong>Every run should be reproducible.</strong> Record the machine, backend version, catalog seed, query mix, concurrency, run duration, and cache state. Compare tuned PostgreSQL with a dedicated search engine on the same workload.</div></div>;
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) { return <div className="lab-metric"><span>{title}</span><strong>{value}</strong><small>{note}</small></div>; }
function ChartGroup({ label, first, second }: { label: string; first: number; second: number }) { return <div className="chart-group"><div className="chart-bars"><span className="chart-bar baseline" style={{ height: `${first}%` }} /><span className="chart-bar optimized" style={{ height: `${second}%` }} /></div><span>{label}</span></div>; }

export default App;
