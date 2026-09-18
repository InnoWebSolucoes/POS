import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Star, Trash2, UploadCloud } from 'lucide-react';

import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge, Button, Spinner, toast } from '@/components/ui';
import { catalogApi } from '../catalog-api';
import type { EditorImage, ProductForm, PatchForm } from './use-product-form';

export interface ImagensTabProps {
  form: ProductForm;
  patch: PatchForm;
  canWrite: boolean;
}

const MAX_IMAGES = 12;

export function ImagensTab({ form, patch, canWrite }: ImagensTabProps) {
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const cameraRef = React.useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: (files: File[]) => catalogApi.uploadImages(files),
    onSuccess: (result) => {
      const added: EditorImage[] = result.files.map((file) => ({ url: file.url, alt: null }));
      patch({ images: [...form.images, ...added].slice(0, MAX_IMAGES) });
      toast.success(
        'Imagens carregadas',
        'Guarde o produto para as associar definitivamente.',
      );
    },
    onError: (error) =>
      toast.error(
        'Falhou o carregamento',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      ),
  });

  const accept = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      toast.warning('Ficheiro ignorado', 'Apenas imagens sao aceites.');
      return;
    }
    const room = MAX_IMAGES - form.images.length;
    if (room <= 0) {
      toast.warning('Limite atingido', `Um produto aceita no maximo ${MAX_IMAGES} imagens.`);
      return;
    }
    upload.mutate(files.slice(0, room));
  };

  const move = (index: number, delta: number) => {
    const next = [...form.images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [image] = next.splice(index, 1);
    if (image) next.splice(target, 0, image);
    patch({ images: next });
  };

  const makePrimary = (index: number) => {
    if (index === 0) return;
    const next = [...form.images];
    const [image] = next.splice(index, 1);
    if (image) next.unshift(image);
    patch({ images: next });
  };

  return (
    <div className="flex flex-col gap-5">
      {canWrite && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            accept(event.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-primary bg-primary/10' : 'border-border bg-muted/30',
          )}
        >
          {upload.isPending ? (
            <>
              <Spinner className="size-8" />
              <p className="text-sm text-muted-foreground">A carregar imagens...</p>
            </>
          ) : (
            <>
              <UploadCloud className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">
                Arraste imagens para aqui
              </p>
              <p className="text-xs text-muted-foreground">
                PNG ou JPG. A primeira imagem e a principal. Ate {MAX_IMAGES} por produto.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  leftIcon={<ImagePlus />}
                  onClick={() => fileRef.current?.click()}
                >
                  Escolher ficheiros
                </Button>
                <Button
                  variant="outline"
                  leftIcon={<Camera />}
                  onClick={() => cameraRef.current?.click()}
                >
                  Tirar foto
                </Button>
              </div>
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              accept(event.target.files);
              event.target.value = '';
            }}
          />
          {/* Opens the rear camera straight away on a phone. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              accept(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      )}

      {form.images.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Sem imagens. Um produto com foto vende-se melhor na loja online e e mais rapido de
          encontrar na grelha da caixa.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {form.images.map((image, index) => (
            <li
              key={image.url}
              className={cn(
                'flex flex-col gap-2 rounded-xl border bg-card p-2',
                index === 0 ? 'border-primary' : 'border-border',
              )}
            >
              <div className="relative">
                <img
                  src={image.url}
                  alt={image.alt ?? ''}
                  className="aspect-square w-full rounded-lg object-cover"
                  loading="lazy"
                />
                {index === 0 && (
                  <Badge className="absolute left-2 top-2" size="sm">
                    Principal
                  </Badge>
                )}
              </div>

              {canWrite && (
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Mover para tras"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Mover para a frente"
                      disabled={index === form.images.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowRight />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Definir como principal"
                      disabled={index === 0}
                      onClick={() => makePrimary(index)}
                    >
                      <Star />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover imagem"
                    onClick={() =>
                      patch({ images: form.images.filter((_, position) => position !== index) })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ImagensTab;
