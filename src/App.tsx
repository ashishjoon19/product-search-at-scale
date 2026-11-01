import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';

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
type CatalogForm = { name: string; brand: string; category: string; price: string; sku: string; description: string; specs: string };
type FacetCounts = { categories: { name: string; count: number }[]; brands: { name: string; count: number }[] };
type CatalogPriceRange = { min: number; max: number };

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
function productSearchText(product: Product): string {
  return `${product.name} ${product.brand} ${product.category} ${product.description} ${product.specs.join(' ')}`.toLocaleLowerCase();
}

function App() {
  const [page, setPage] = useState<Page>('Home');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product>(seedProducts[0]);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [maxPriceFilter, setMaxPriceFilter] = useState(Number.POSITIVE_INFINITY);
  const [sort, setSort] = useState('Relevance');
  const [products, setProducts] = useState(seedProducts);
  const [catalogTotal, setCatalogTotal] = useState(seedProducts.length);
  const [searchTotal, setSearchTotal] = useState(seedProducts.length);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [facetCounts, setFacetCounts] = useState<FacetCounts | undefined>(undefined);
  const [catalogPriceRange, setCatalogPriceRange] = useState<CatalogPriceRange>(() => ({ min: Math.min(...seedProducts.map((product) => product.price)), max: Math.max(...seedProducts.map((product) => product.price)) }));
  const [savedNotice, setSavedNotice] = useState('');
  const [searchBackend, setSearchBackend] = useState('PostgreSQL · full-text + indexes');
  const [datasetSize, setDatasetSize] = useState('1,000,000 products');
  const [benchmarkNotice, setBenchmarkNotice] = useState('No benchmark run yet. Results will appear here after a real run.');
  const [form, setForm] = useState<CatalogForm>({ name: '', brand: '', category: 'Laptops', price: '', sku: '', description: '', specs: '' });
  const [apiConnected, setApiConnected] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/search?q=&limit=50').then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { items: Omit<Product, 'icon'>[]; total: number; nextCursor: string | null; facets: FacetCounts; priceRange: CatalogPriceRange }) => {
        if (!live || !Array.isArray(data.items)) return;
        setApiConnected(true);
        setCatalogTotal(data.total);
        setSearchTotal(data.total);
        setNextCursor(data.nextCursor);
        setFacetCounts(data.facets);
        setCatalogPriceRange(data.priceRange);
        if (data.items.length === 0) { setProducts([]); return; }
        const icons: Record<string, string> = { Laptops: '💻', Audio: '🎧', Accessories: '⌨️', Monitors: '🖥️' };
        setProducts(data.items.map((item) => ({ ...item, icon: icons[item.category] ?? '📦', specs: Array.isArray(item.specs) ? item.specs : [] })));
        setApiConnected(true);
      }).catch(() => { if (live) setApiConnected(false); });
    return () => { live = false; };
  }, []);

  const matches = useMemo(() => {
    const normalized = submittedQuery.trim().toLocaleLowerCase();
    const list = products.filter((product) => {
      const searchable = productSearchText(product);
      const queryMatch = !normalized || normalized === product.sku.toLowerCase() || textMatches(normalized, searchable);
      const categoryMatch = categoryFilter === 'All' || product.category === categoryFilter;
      const brandMatch = brandFilter === 'All' || product.brand === brandFilter;
      const priceMatch = product.price <= maxPriceFilter;
      return queryMatch && categoryMatch && brandMatch && priceMatch && (!availableOnly || product.stock > 0);
    });
    if (sort === 'Price: low to high') list.sort((a, b) => a.price - b.price);
    if (sort === 'Price: high to low') list.sort((a, b) => b.price - a.price);
    return list;
  }, [products, submittedQuery, categoryFilter, brandFilter, availableOnly, maxPriceFilter, sort]);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return products.filter((product) => product.sku.toLowerCase() === normalized || textMatches(normalized, productSearchText(product))).slice(0, 4);
  }, [products, query]);

  async function search(value = query) {
    setSubmittedQuery(value.trim());
    setQuery(value);
    setCategoryFilter('All');
    setBrandFilter('All');
    setAvailableOnly(false);
    setMaxPriceFilter(Number.POSITIVE_INFINITY);
    setPage('Search results');
    try {
      const params = new URLSearchParams({ q: value.trim(), limit: '50' });
      const response = await fetch(`/api/search?${params}`);
      if (!response.ok) throw new Error('API search unavailable');
      const data = await response.json() as { items: Omit<Product, 'icon'>[]; total: number; nextCursor: string | null; facets: FacetCounts; priceRange: CatalogPriceRange };
      const icons: Record<string, string> = { Laptops: '💻', Audio: '🎧', Accessories: '⌨️', Monitors: '🖥️' };
      setProducts(data.items.map((item) => ({ ...item, icon: icons[item.category] ?? '📦', specs: Array.isArray(item.specs) ? item.specs : [] })));
      setSearchTotal(data.total);
      setNextCursor(data.nextCursor);
      setFacetCounts(data.facets);
      setCatalogPriceRange(data.priceRange);
      setApiConnected(true);
    } catch { setNextCursor(null); /* The prototype remains usable with its clearly labeled local fallback. */ }
  }
  async function loadMore() {
    if (!nextCursor) return;
    const params = new URLSearchParams({ q: submittedQuery, limit: '50', cursor: nextCursor });
    if (categoryFilter !== 'All') params.set('category', categoryFilter);
    if (brandFilter !== 'All') params.set('brand', brandFilter);
    if (availableOnly) params.set('inStock', 'true');
    if (Number.isFinite(maxPriceFilter)) params.set('maxPrice', String(maxPriceFilter));
    const response = await fetch(`/api/search?${params}`);
    if (!response.ok) return;
    const data = await response.json() as { items: Omit<Product, 'icon'>[]; total: number; nextCursor: string | null };
    const icons: Record<string, string> = { Laptops: '💻', Audio: '🎧', Accessories: '⌨️', Monitors: '🖥️' };
    setProducts((current) => [...current, ...data.items.map((item) => ({ ...item, icon: icons[item.category] ?? '📦', specs: Array.isArray(item.specs) ? item.specs : [] }))]);
    setSearchTotal(data.total);
    setNextCursor(data.nextCursor);
  }
  async function applyFilters(filters: { category?: string; brand?: string; availableOnly?: boolean; maxPrice?: number; query?: string }) {
    const category = filters.category ?? categoryFilter;
    const brand = filters.brand ?? brandFilter;
    const availableOnlyValue = filters.availableOnly ?? availableOnly;
    const maxPriceValue = filters.maxPrice ?? maxPriceFilter;
    setCategoryFilter(category); setBrandFilter(brand); setAvailableOnly(availableOnlyValue); setMaxPriceFilter(maxPriceValue);
    const params = new URLSearchParams({ q: filters.query ?? submittedQuery, limit: '50' });
    if (category !== 'All') params.set('category', category);
    if (brand !== 'All') params.set('brand', brand);
    if (availableOnlyValue) params.set('inStock', 'true');
    if (Number.isFinite(maxPriceValue)) params.set('maxPrice', String(maxPriceValue));
    try {
      const response = await fetch(`/api/search?${params}`);
      if (!response.ok) return;
      const data = await response.json() as { items: Omit<Product, 'icon'>[]; total: number; nextCursor: string | null; facets: FacetCounts; priceRange: CatalogPriceRange };
      const icons: Record<string, string> = { Laptops: '💻', Audio: '🎧', Accessories: '⌨️', Monitors: '🖥️' };
      setProducts(data.items.map((item) => ({ ...item, icon: icons[item.category] ?? '📦', specs: Array.isArray(item.specs) ? item.specs : [] })));
      setSearchTotal(data.total); setNextCursor(data.nextCursor); setFacetCounts(data.facets); setCatalogPriceRange(data.priceRange);
    } catch { setNextCursor(null); }
  }
  function clearFilters() {
    setCategoryFilter('All'); setBrandFilter('All'); setAvailableOnly(false); setMaxPriceFilter(Number.POSITIVE_INFINITY);
    void applyFilters({ category: 'All', brand: 'All', availableOnly: false, maxPrice: Number.POSITIVE_INFINITY });
  }
  function openProduct(product: Product) {
    setSelectedProduct(product);
    setPage('Product detail');
  }
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created: Product = {
      id: `p-${Date.now()}`, name: form.name, brand: form.brand, category: form.category,
      description: form.description, price: Number(form.price), rating: 0, reviews: 0,
      stock: 10, sku: form.sku, icon: form.category === 'Audio' ? '🎧' : form.category === 'Monitors' ? '🖥️' : '💻', specs: form.specs.split('\n').map((value) => value.trim()).filter(Boolean),
    };
    if (apiConnected) {
      try {
        const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: created.sku, name: created.name, brand: created.brand, category: created.category, description: created.description, specs: created.specs, price: created.price, rating: created.rating, reviews: created.reviews, stock: created.stock }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not save product');
        created.id = String(body.id);
        setSavedNotice(`${created.name} saved to PostgreSQL. Search indexing is asynchronous.`);
      } catch (error) { setSavedNotice(error instanceof Error ? error.message : 'Could not save product'); return; }
    } else {
      setSavedNotice(`${created.name} saved to the local demo catalog. Start PostgreSQL and the API to persist products.`);
    }
    setProducts((current) => [created, ...current]);
    setCatalogTotal((current) => current + 1);
    setSearchTotal((current) => current + 1);
    setForm({ name: '', brand: '', category: 'Laptops', price: '', sku: '', description: '', specs: '' });
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
        {categories.map((category) => <button type="button" key={category.name} onClick={() => { const selected = category.name === 'Computers' ? 'Laptops' : category.name === 'Home office' ? 'All' : category.name; setQuery(''); setSubmittedQuery(''); setPage('Search results'); void applyFilters({ category: selected, brand: 'All', availableOnly: false, maxPrice: Number.POSITIVE_INFINITY, query: '' }); }}>{category.name}</button>)}
        <span className="generated-note">{apiConnected ? 'PostgreSQL connected' : 'Demo catalog · local fallback'}</span>
      </nav>
    </header>

    <main>
      {page === 'Home' && <Home products={products} totalProducts={catalogTotal} onSearch={search} onOpenProduct={openProduct} onCategory={(name) => { const selected = name === 'Computers' ? 'Laptops' : name === 'Home office' ? 'All' : name; setSubmittedQuery(''); setQuery(''); setPage('Search results'); void applyFilters({ category: selected, brand: 'All', availableOnly: false, maxPrice: Number.POSITIVE_INFINITY, query: '' }); }} />}
      {page === 'Search results' && <Results query={submittedQuery} results={matches} catalog={products} facets={facetCounts} priceRange={catalogPriceRange} category={categoryFilter} setCategory={(value) => void applyFilters({ category: value })} brand={brandFilter} setBrand={(value) => void applyFilters({ brand: value })} availableOnly={availableOnly} setAvailableOnly={(value) => void applyFilters({ availableOnly: value })} maxPrice={maxPriceFilter} setMaxPrice={(value) => void applyFilters({ maxPrice: value })} clearFilters={clearFilters} sort={sort} setSort={setSort} onOpenProduct={openProduct} total={searchTotal} canLoadMore={Boolean(nextCursor)} onLoadMore={loadMore} />}
      {page === 'Product detail' && <ProductDetail product={selectedProduct} onBack={() => setPage('Search results')} />}
      {page === 'Catalog manager' && <CatalogManager products={products} total={catalogTotal} form={form} setForm={setForm} onSave={saveProduct} notice={savedNotice} connected={apiConnected} />}
      {page === 'Search Lab' && <SearchLab backend={searchBackend} setBackend={setSearchBackend} datasetSize={datasetSize} setDatasetSize={setDatasetSize} notice={benchmarkNotice} onRun={() => setBenchmarkNotice('Run history refreshed. Use the displayed command in the project terminal to start a measurement.')} />}
    </main>

    <footer className="site-footer"><span>Foundry Catalog <span className="muted">· Search engineering demo</span></span><nav aria-label="Project areas">{(['Home', 'Catalog manager', 'Search Lab'] as Page[]).map((item) => <button type="button" key={item} className={page === item ? 'footer-link active' : 'footer-link'} onClick={() => setPage(item)}>{item}</button>)}</nav></footer>
  </div>;
}

function Home({ products, totalProducts, onSearch, onOpenProduct, onCategory }: { products: Product[]; totalProducts: number; onSearch: (value: string) => void; onOpenProduct: (product: Product) => void; onCategory: (name: string) => void }) {
  const [heroQuery, setHeroQuery] = useState('');
  const featured = products.slice(0, 4);
  const runExample = (value: string) => {
    setHeroQuery(value);
    onSearch(value);
  };
  return <div className="page-content">
    <section className="home-hero">
      <div className="home-hero-copy">
        <div className="eyebrow"><span className="live-dot" /> PRODUCT SEARCH, REIMAGINED</div>
        <h1>Good search makes<br /><em>every product</em> easier to find.</h1>
        <p>Search by name, brand, or SKU. Try a typo, explore the catalog, and see how a thoughtful search experience feels.</p>
        <form className="hero-search home-search" onSubmit={(event) => { event.preventDefault(); onSearch(heroQuery); }}>
          <span className="hero-search-icon" aria-hidden="true">⌕</span>
          <input aria-label="Search the catalog" value={heroQuery} onChange={(event) => setHeroQuery(event.target.value)} placeholder="Search laptops, headphones, and more" />
          <button className="button-primary" type="submit">Search <span aria-hidden="true">→</span></button>
        </form>
        <div className="quick-searches"><span>Try:</span>{['Dell laptop', 'wireles headphones', 'LG monitor'].map((term) => <button type="button" key={term} onClick={() => runExample(term)}>{term}</button>)}</div>
      </div>
      <div className="home-hero-art" aria-label="Featured products in the catalog">
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="floating-product laptop-float">💻</div><div className="floating-product audio-float">🎧</div><div className="floating-product watch-float">⌚</div>
        <div className="hero-art-caption"><span className="caption-spark">✳</span><span><strong>Find your next favorite</strong><small>{totalProducts.toLocaleString()} products in the catalog</small></span></div>
      </div>
      <div className="hero-bottomline"><span><i /> Fast suggestions</span><span><i /> Typo-tolerant demo</span><span><i /> Search by SKU</span><small>Interactive demo · catalog data is local</small></div>
    </section>

    <section className="home-categories">
      <div className="section-heading"><div><span className="section-kicker">A GOOD PLACE TO START</span><h2>Browse by category</h2></div><span className="catalog-count">{categories.length} categories <b>↗</b></span></div>
      <div className="category-grid">{categories.map((item, index) => <button className={`category-tile category-tile-${index + 1}`} type="button" key={item.name} onClick={() => onCategory(item.name === 'Computers' ? 'Laptops' : item.name === 'Home office' ? 'All' : item.name)}><span>{item.icon}</span><strong>{item.name}</strong><span className="tile-arrow">↗</span></button>)}</div>
    </section>

    <section className="home-featured">
      <div className="section-heading"><div><span className="section-kicker">HANDPICKED FOR THE DEMO</span><h2>Popular in the catalog</h2></div><button className="text-button" type="button" onClick={() => onSearch('')}>Explore all products <span>→</span></button></div>
      <div className="product-grid">{featured.map((product) => <ProductCard product={product} key={product.id} onOpen={() => onOpenProduct(product)} />)}</div>
    </section>

    <section className="search-story"><div className="story-mark">F<span>⌕</span></div><div><span className="section-kicker">THE PROJECT</span><h2>Search should stay useful as catalogs grow.</h2><p>This demo is the starting point for measuring search quality and speed at scale. Search Lab will compare real workloads once the backend and benchmark are connected.</p></div><div className="story-note"><span>01</span><strong>Search experience</strong><small>Explore the working UI</small></div><div className="story-note"><span>02</span><strong>Performance lab</strong><small>Measurements come later</small></div>
    </section>
  </div>;
}

function ProductCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
  return <button className="product-card" type="button" onClick={onOpen}><span className="product-image"><span className="product-symbol">{product.icon}</span>{product.reviews > 90 && <span className="popular-tag">Popular</span>}</span><span className="product-meta">{product.brand} · {product.category}</span><strong className="product-title">{product.name}</strong><span className="rating">★★★★★ <span>({product.reviews})</span></span><span className="product-price">{money(product.price)}</span><span className={product.stock ? 'stock-label' : 'stock-label out'}>{product.stock ? 'In stock' : 'Currently unavailable'}</span></button>;
}

function Results({ query, results, catalog, facets, priceRange, category, setCategory, brand, setBrand, availableOnly, setAvailableOnly, maxPrice, setMaxPrice, clearFilters, sort, setSort, onOpenProduct, total, canLoadMore, onLoadMore }: { query: string; results: Product[]; catalog: Product[]; facets?: FacetCounts; priceRange: CatalogPriceRange; category: string; setCategory: (value: string) => void; brand: string; setBrand: (value: string) => void; availableOnly: boolean; setAvailableOnly: (value: boolean) => void; maxPrice: number; setMaxPrice: (value: number) => void; clearFilters: () => void; sort: string; setSort: (value: string) => void; onOpenProduct: (product: Product) => void; total: number; canLoadMore: boolean; onLoadMore: () => void }) {
  const categoryOptions = ['All', ...Array.from(new Set([...catalog.map((product) => product.category), ...(facets?.categories.map((item) => item.name) ?? [])])).sort()];
  const brandOptions = ['All', ...Array.from(new Set([...catalog.map((product) => product.brand), ...(facets?.brands.map((item) => item.name) ?? [])])).sort()];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryMatches = catalog.filter((product) => !normalizedQuery || normalizedQuery === product.sku.toLowerCase() || textMatches(normalizedQuery, productSearchText(product)));
  const categoryFacetProducts = queryMatches.filter((product) => (brand === 'All' || product.brand === brand) && product.price <= maxPrice && (!availableOnly || product.stock > 0));
  const brandFacetProducts = queryMatches.filter((product) => (category === 'All' || product.category === category) && product.price <= maxPrice && (!availableOnly || product.stock > 0));
  const categoryCount = (option: string) => facets ? option === 'All' ? facets.categories.reduce((sum, item) => sum + item.count, 0) : facets.categories.find((item) => item.name === option)?.count ?? 0 : option === 'All' ? categoryFacetProducts.length : categoryFacetProducts.filter((product) => product.category === option).length;
  const brandCount = (option: string) => facets ? option === 'All' ? facets.brands.reduce((sum, item) => sum + item.count, 0) : facets.brands.find((item) => item.name === option)?.count ?? 0 : option === 'All' ? brandFacetProducts.length : brandFacetProducts.filter((product) => product.brand === option).length;
  const catalogMinPrice = priceRange.min;
  const catalogMaxPrice = priceRange.max;
  const shownMaxPrice = Math.min(maxPrice, catalogMaxPrice);
  const filterGroups = [
    { title: 'Category', options: categoryOptions, selected: category, setSelected: setCategory, count: categoryCount },
    { title: 'Brand', options: brandOptions, selected: brand, setSelected: setBrand, count: brandCount },
  ];
  const filtered = results;
  return <div className="page-content results-page"><div className="breadcrumb">Catalog <span>/</span> Search</div><div className="results-title"><div><div className="eyebrow">Search results</div><h1>{query ? <>Results for “{query}”</> : 'All products'}</h1><p>{filtered.length}{canLoadMore ? ` shown of ${total.toLocaleString()} matches` : ' products found in this catalog'}</p></div><label className="sort-control">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option>Relevance</option><option>Price: low to high</option><option>Price: high to low</option></select></label></div>
    <div className="results-layout"><aside className="filter-sidebar"><div className="filter-head"><strong>Filters</strong><button type="button" className="text-button" onClick={clearFilters}>Clear all</button></div>{filterGroups.map((group) => <fieldset className="filter-group" key={group.title}><legend>{group.title}</legend>{group.options.map((option) => <label className="filter-option" key={option}><input type="radio" name={group.title} checked={group.selected === option} onChange={() => group.setSelected(option)} />{option === 'All' ? `All ${group.title.toLowerCase()}s` : option}<span>{group.count(option)}</span></label>)}</fieldset>)}<fieldset className="filter-group"><legend>Availability</legend><label className="filter-option"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />In stock now</label></fieldset><fieldset className="filter-group"><legend>Price range</legend><div className="price-range"><span>{money(catalogMinPrice)}</span><span>{money(shownMaxPrice)}</span></div><input className="range-input" type="range" min={catalogMinPrice} max={catalogMaxPrice} step="1" value={shownMaxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} aria-label="Maximum price" /></fieldset></aside>
      <section className="result-list" aria-label="Matching products">{filtered.length === 0 ? <div className="empty-state"><span>⌕</span><h2>No matching products</h2><p>Try a shorter query or clear a filter to broaden your search.</p></div> : <>{filtered.map((product) => <article className="result-row" key={product.id}><button className="result-image" type="button" onClick={() => onOpenProduct(product)}>{product.icon}</button><div className="result-copy"><span className="product-meta">{product.brand} · {product.category}</span><button type="button" className="result-name" onClick={() => onOpenProduct(product)}>{product.name}</button><p className="result-about"><strong>About:</strong> {product.description}</p>{product.specs.length > 0 && <p className="result-specs"><strong>Specifications:</strong> {product.specs.join(' · ')}</p>}<span className={product.stock ? 'stock-label' : 'stock-label out'}>{product.stock ? '✓ In stock' : 'Currently unavailable'}</span></div><div className="result-actions"><strong>{money(product.price)}</strong><button className="button-secondary" type="button" onClick={() => onOpenProduct(product)}>View product</button></div></article>)}{canLoadMore && <button className="button-secondary" type="button" onClick={onLoadMore}>Load next page</button>}</>}</section>
    </div>
  </div>;
}

function ProductDetail({ product, onBack }: { product: Product; onBack: () => void }) {
  const [added, setAdded] = useState(false);
  return <div className="page-content detail-page"><div className="breadcrumb"><button type="button" onClick={onBack}>Search results</button><span>/</span>{product.category}<span>/</span>{product.brand}</div><div className="detail-layout"><div><div className="detail-image"><span>{product.icon}</span><span className="detail-image-label">Product image · demo catalog</span></div><div className="thumb-strip"><span>{product.icon}</span><span>Specs</span><span>Details</span></div></div><section className="detail-info"><div className="eyebrow">{product.brand} · {product.category}</div><h1>{product.name}</h1><p className="sku-line">SKU: {product.sku}</p><div className="rating detail-rating">★★★★★ <span>{product.rating || '—'} · {product.reviews} reviews</span></div><div className="detail-price">{money(product.price)}</div><p className="freshness-note"><span>✓</span> Current price and availability from the product record</p><div className="purchase-box"><strong className={product.stock ? 'stock-label' : 'stock-label out'}>{product.stock ? 'In stock' : 'Currently unavailable'}</strong><p>{product.stock ? `${product.stock} available in this demo catalog.` : 'This item is temporarily out of stock.'}</p><button className="button-primary" type="button" disabled={!product.stock} onClick={() => setAdded(true)}>{added ? 'Added to cart ✓' : 'Add to cart'}</button><button className="button-secondary save-button" type="button">♡ Save for later</button></div><h2 className="spec-heading">About this product</h2><p className="product-about-copy">{product.description}</p><h2 className="spec-heading">Key specifications</h2><dl className="spec-list">{product.specs.map((spec, index) => <div key={spec}><dt>{['Processor / feature', 'Memory / connection', 'Display / battery', 'Storage / charging'][index % 4]}</dt><dd>{spec}</dd></div>)}</dl></section></div></div>;
}

function CatalogManager({ products, total, form, setForm, onSave, notice, connected }: { products: Product[]; total: number; form: CatalogForm; setForm: Dispatch<SetStateAction<CatalogForm>>; onSave: (event: FormEvent<HTMLFormElement>) => void; notice: string; connected: boolean }) {
  return <div className="page-content manager-page"><div className="manager-title"><div><div className="eyebrow">Internal tool</div><h1>Catalog manager</h1><p>Manage product records; PostgreSQL changes are queued for asynchronous search indexing.</p></div><div className="sync-summary"><span className="sync-dot" /> Catalog status <strong>{connected ? 'PostgreSQL connected' : 'Local demo'}</strong></div></div><div className="manager-layout"><form className="manager-form" onSubmit={onSave}><div className="panel-heading"><h2>Add a product</h2><p>{connected ? 'New records and their search-sync events are saved together.' : 'Start the database and API to persist product records.'}</p></div><label>Product name<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Dell Latitude 5440" /></label><div className="form-two"><label>Brand<input required value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} placeholder="Brand" /></label><label>Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}><option>Laptops</option><option>Audio</option><option>Accessories</option><option>Monitors</option></select></label></div><div className="form-two"><label>SKU<input required value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} placeholder="Unique SKU" /></label><label>Price (INR)<input required type="number" min="1" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} placeholder="74990" /></label></div><label>About<input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Short product description" /></label><label>Specifications <small>One specification per line; all lines are searchable.</small><textarea value={form.specs} onChange={(event) => setForm((current) => ({ ...current, specs: event.target.value }))} placeholder={'Intel Core i7-1355U\n16 GB DDR5\n512 GB SSD'} rows={4} /></label>{notice && <div className="notice" role="status">{notice}</div>}<button className="button-primary" type="submit">Save product</button></form><section className="catalog-table-panel"><div className="panel-heading table-heading"><div><h2>Catalog records in this view</h2><p>Search indexing runs asynchronously through the outbox worker.</p></div><span className="record-count">{products.length} shown · {total.toLocaleString()} total</span></div><div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Indexing</th></tr></thead><tbody>{products.slice(0, 7).map((product) => <tr key={product.id}><td><span className="table-product-icon">{product.icon}</span><strong>{product.name}</strong><small>{product.brand}</small></td><td>{product.sku}</td><td>{money(product.price)}</td><td><span className="sync-status"><i />Outbox managed</span></td></tr>)}</tbody></table></div></section></div></div>;
}

function SearchLab({ backend, setBackend, datasetSize, setDatasetSize, notice, onRun }: { backend: string; setBackend: (value: string) => void; datasetSize: string; setDatasetSize: (value: string) => void; notice: string; onRun: () => void }) {
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const refreshRuns = () => fetch('/api/benchmarks').then((response) => response.ok ? response.json() : Promise.reject()).then((body: { runs?: Record<string, unknown>[] }) => setRuns(body.runs ?? [])).catch(() => setRuns([]));
  useEffect(() => { void refreshRuns(); }, []);
  const latest = runs[0];
  const modeOptions = ['baseline', 'optimized', 'meilisearch'];
  const selectedMode = backend.toLowerCase().includes('meili') ? 'meilisearch' : backend.toLowerCase().includes('optimized') ? 'optimized' : 'baseline';
  return <div className="page-content lab-page"><div className="eyebrow">Engineering view</div><h1>Search Lab</h1><p>Measured search runs from the same generated catalog. Nothing is shown as a result until the benchmark runner records it.</p>
    <section className="lab-toolbar"><label>Search backend<select value={selectedMode} onChange={(event) => setBackend(event.target.value)}>{modeOptions.map((mode) => <option key={mode} value={mode}>{mode === 'meilisearch' ? 'Meilisearch' : mode === 'optimized' ? 'PostgreSQL · indexed' : 'PostgreSQL · baseline'}</option>)}</select></label><label>Catalog size<select value={datasetSize} onChange={(event) => setDatasetSize(event.target.value)}>{['1,000 products', '100,000 products', '1,000,000 products', '10,000,000 products'].map((size) => <option key={size}>{size}</option>)}</select></label><button className="button-primary" type="button" onClick={() => { void refreshRuns(); onRun(); }}>Refresh run history</button></section>
    <div className="lab-message" role="status">{notice}</div>
    <div className="lab-metrics"><Metric title="Latest p95" value={latest ? `${Number(latest.p95_ms).toFixed(2)} ms` : '—'} note={latest ? `${Number(latest.dataset_size).toLocaleString()} rows · ${latest.mode}` : 'No recorded run'} /><Metric title="Mean latency" value={latest ? `${Number(latest.mean_ms).toFixed(2)} ms` : '—'} note={latest ? `${Number(latest.throughput_rps).toFixed(1)} requests/second` : 'No recorded run'} /><Metric title="Request errors" value={latest ? String(latest.error_count) : '—'} note={latest ? `${latest.request_count} measured requests` : 'No recorded run'} /></div>
    <section className="chart-panel"><div className="chart-heading"><div><h2>Recorded benchmark runs</h2><p>Values below come from benchmark_runs in PostgreSQL.</p></div><span className="chart-empty">{runs.length} runs</span></div>{runs.length ? <div className="table-scroll"><table><thead><tr><th>Dataset</th><th>Backend</th><th>Requests</th><th>p50</th><th>p95</th><th>p99</th><th>Errors</th><th>Date</th></tr></thead><tbody>{runs.map((run, index) => <tr key={`${run.run_id}-${index}`}><td>{Number(run.dataset_size).toLocaleString()}</td><td>{String(run.mode)}</td><td>{String(run.request_count)}</td><td>{Number(run.p50_ms).toFixed(2)} ms</td><td>{Number(run.p95_ms).toFixed(2)} ms</td><td>{Number(run.p99_ms).toFixed(2)} ms</td><td>{String(run.error_count)}</td><td>{new Date(String(run.recorded_at)).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h2>No benchmark runs yet</h2><p>After setup, run the staged commands in README. The CLI records individual timings and adds each summary here.</p></div>}</section>
    <div className="lab-footnote"><strong>Run mode: {selectedMode}, {datasetSize}.</strong> Run `DATASET_SIZE={Number(datasetSize.replaceAll(',', '').split(' ')[0])} SEARCH_MODE={selectedMode} pnpm bench` after generating the selected size. The button refreshes recorded runs; it does not run a heavy workload from a web request.</div></div>;
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) { return <div className="lab-metric"><span>{title}</span><strong>{value}</strong><small>{note}</small></div>; }

export default App;
