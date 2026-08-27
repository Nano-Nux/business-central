import {
  getCachedResource,
  listCachedResources,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { queueDeferredMutation } from "./offline-deferred";
import { imageUploadMarker, PORTAL_IMAGE_UPLOADS, type OfflineImageUpload } from "./offline-images";
import type { CatalogImage, Product, Variant } from "./types";

type CatalogImageOwner = "product" | "variant";

export type QueuedCatalogImage = {
  image_url: string;
  source_type: CatalogImage["source_type"];
  offline_upload?: OfflineImageUpload;
};

function localImageURL(image: QueuedCatalogImage) {
  return image.offline_upload
    ? `data:${image.offline_upload.content_type};base64,${image.offline_upload.data_base64}`
    : image.image_url;
}

async function updateCatalogProjection(
  scope: OfflineScope,
  owner: CatalogImageOwner,
  ownerID: string,
  image: CatalogImage | undefined,
) {
  if (owner === "product") {
    const path = "/catalog/products?page_index=0&page_size=100";
    const cached = await getCachedResource<Product[]>(scope, path).catch(() => null);
    if (cached) {
      await putCachedResource(
        scope,
        path,
        cached.data.map((item) =>
          item.id === ownerID ? { ...item, images: image ? [image] : [] } : item,
        ),
        cached.meta,
      );
    }
    return;
  }
  const resources = await listCachedResources<Variant[]>(scope);
  await Promise.all(
    resources
      .filter(
        (resource) =>
          resource.path.startsWith("/catalog/products/") ||
          resource.path.startsWith("/pos/catalog?"),
      )
      .map((resource) =>
        putCachedResource(
          scope,
          resource.path,
          resource.data.map((item) =>
            item.id === ownerID ? { ...item, images: image ? [image] : [] } : item,
          ),
          resource.meta,
        ),
      ),
  );
}

export async function queueCatalogImageChange(
  scope: OfflineScope,
  input: {
    owner: CatalogImageOwner;
    ownerID: string;
    current?: CatalogImage;
    image?: QueuedCatalogImage;
    dependencyOperationId?: string;
  },
) {
  if (!input.image) {
    if (!input.current) return undefined;
    const operation = await queueDeferredMutation(
      scope,
      {
        entityType: "CATALOG_IMAGE",
        entityId: input.current.id,
        operationType: "DELETE",
        dependencyOperationId: input.dependencyOperationId,
        request: { path: `/catalog/images/${input.current.id}`, method: "DELETE" },
      },
      { ...input.current, is_deleted: true },
    );
    await updateCatalogProjection(scope, input.owner, input.ownerID, undefined);
    return operation;
  }

  const id = input.current?.id ?? crypto.randomUUID();
  const imageURL = input.image.offline_upload
    ? imageUploadMarker(input.image.offline_upload.id)
    : input.image.image_url;
  const body = {
    image_url: imageURL,
    source_type: input.image.source_type,
    position: 0,
  };
  const path = input.current
    ? `/catalog/images/${input.current.id}`
    : input.owner === "product"
      ? `/catalog/products/${input.ownerID}/images`
      : `/catalog/variants/${input.ownerID}/images`;
  const payload = input.image.offline_upload
    ? { ...body, [PORTAL_IMAGE_UPLOADS]: [input.image.offline_upload] }
    : body;
  const projection: CatalogImage = {
    id,
    ...(input.owner === "product" ? { product_id: input.ownerID } : { variant_id: input.ownerID }),
    image_url: localImageURL(input.image),
    source_type: input.image.source_type,
    position: 0,
  };
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "CATALOG_IMAGE",
      entityId: id,
      operationType: input.current ? "UPDATE" : "CREATE",
      dependencyOperationId: input.dependencyOperationId,
      request: { path, method: input.current ? "PATCH" : "POST", body },
      payload,
    },
    projection,
  );
  await updateCatalogProjection(scope, input.owner, input.ownerID, projection);
  return operation;
}
