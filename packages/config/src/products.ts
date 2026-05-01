export type ProductId = string;

export type Product = {
  id: ProductId;
  name: string;
  app: string;
};

export const PRODUCTS: readonly Product[] = [];
