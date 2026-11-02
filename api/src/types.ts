export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  specs: string[];
  price: string;
  rating: string;
  reviews: number;
  stock: number;
  active: boolean;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  specs: string[];
  price: number;
  rating: number;
  reviews: number;
  stock: number;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    category: row.category,
    description: row.description,
    specs: row.specs ?? [],
    price: Number(row.price),
    rating: Number(row.rating),
    reviews: row.reviews,
    stock: row.stock,
    active: row.active,
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
