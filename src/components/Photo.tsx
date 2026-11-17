import { getCategory } from '../data';
import { getRecipeImageOverride, useRecipeImageOverrides } from '../lib/recipeImages';
import type { Recipe } from '../types';

export const defaultImgUrl = (id: string, thumb: boolean) =>
  `${import.meta.env.BASE_URL}img/${thumb ? 't/' : ''}${id}.webp`;

export const imgUrl = (id: string, thumb: boolean) =>
  getRecipeImageOverride(id) ?? defaultImgUrl(id, thumb);

export function Photo({
  recipe,
  thumb = true,
  eager = false,
  className = '',
}: {
  recipe: Recipe;
  thumb?: boolean;
  eager?: boolean;
  className?: string;
}) {
  const overrides = useRecipeImageOverrides();
  const customSrc = overrides[recipe.id];
  const src = customSrc || (recipe.img ? defaultImgUrl(recipe.img, thumb) : '');

  if (src) {
    return (
      <img
        className={`photo ${className}`}
        src={src}
        alt={`Foto de ${recipe.title}`}
        width={thumb ? 420 : 800}
        height={thumb ? 273 : 520}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    );
  }
  const cat = getCategory(recipe.cat)?.name ?? '';
  return (
    <div className={`photo photo-empty ${className}`} role="img" aria-label={`${recipe.title} (sem foto)`}>
      <img src={`${import.meta.env.BASE_URL}icons/logo-mark.png`} alt="" width={96} height={60} />
      <span>{cat}</span>
    </div>
  );
}
