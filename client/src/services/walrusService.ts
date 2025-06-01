// Service for interacting with Walrus blob storage via Web API

export const NUM_EPOCH_WALRUS = 1; // Default epochs for storage, can be overridden by publisher

export interface WalrusService {
  id: string;
  name: string;
  publisherUrl: string; // Should be the full base URL for the publisher, e.g., https://walrus.example.com/publisherX
  aggregatorUrl: string; // Not used for basic PUT upload but good to keep for completeness
}

// Restore your WALRUS_SERVICES configuration here
// Example structure based on previous setup:
export const WALRUS_SERVICES: WalrusService[] = [
  {
    id: "service1",
    name: "walrus.space (seal-example)",
    publisherUrl: "https://publisher.walrus-testnet.walrus.space",
    aggregatorUrl: "https://aggregator.walrus-testnet.walrus.space",
  },
];

function getWalrusUploadUrl(
  serviceId?: string,
  sendToObjectAddress?: string
): string {
  let selectedService: WalrusService | undefined;

  if (serviceId) {
    selectedService = WALRUS_SERVICES.find((s) => s.id === serviceId);
  }

  if (!selectedService) {
    if (serviceId) {
      console.warn(
        `Walrus service with ID "${serviceId}" not found. Falling back to default.`
      );
    }
    if (WALRUS_SERVICES.length === 0) {
      throw new Error("No Walrus services defined.");
    }
    selectedService = WALRUS_SERVICES[0]; // Default to the first service
    console.log(
      `Using default Walrus service for upload: ${selectedService.name} (ID: ${selectedService.id})`
    );
  } else {
    console.log(
      `Using Walrus service for upload: ${selectedService.name} (ID: ${selectedService.id})`
    );
  }

  // The Walrus Web API docs (https://github.com/MystenLabs/walrus/blob/main/docs/book/usage/web-api.md)
  // indicate PUT /blobs?epochs=<num_epochs>
  // Based on user-provided snippet, the path might be /v1/blobs
  let baseUrl = selectedService.publisherUrl;
  baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl; // Remove trailing slash if present

  let url = `${baseUrl}/v1/blobs?epochs=${NUM_EPOCH_WALRUS}`;
  if (sendToObjectAddress) {
    url += `&send_object_to=${sendToObjectAddress}`;
  }
  return url;
}

export async function storeBlobOnWalrus(
  encryptedData: Uint8Array,
  serviceId?: string,
  sendToObjectAddress?: string
): Promise<{ blobId: string; storageInfo: any }> {
  const url = getWalrusUploadUrl(serviceId, sendToObjectAddress);
  console.log(
    `Storing blob on Walrus (Web API) at: ${url} (Service ID: ${
      serviceId || "default"
    }, SendTo: ${sendToObjectAddress || "None"})`
  );

  const response = await fetch(url, {
    method: "PUT",
    body: encryptedData,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      "Error publishing the blob on Walrus (Web API):",
      response.status,
      errorBody
    );
    throw new Error(
      `Failed to store blob on Walrus (Web API). Status: ${response.status}. Message: ${errorBody}`
    );
  }

  const storageInfo = await response.json();
  console.log("Walrus (Web API) storage info:", storageInfo);

  // Extract blobId - structure might vary based on publisher implementation
  // Common patterns observed or assumed:
  let blobId: string | undefined;
  if (storageInfo?.blob_id) {
    // Direct blob_id
    blobId = storageInfo.blob_id;
  } else if (storageInfo?.alreadyCertified?.blobId) {
    // From previous SDK interaction attempt
    blobId = storageInfo.alreadyCertified.blobId;
  } else if (storageInfo?.newlyCreated?.blobObject?.blobId) {
    // From previous SDK interaction attempt
    blobId = storageInfo.newlyCreated.blobObject.blobId;
  } else if (storageInfo?.id) {
    // Some APIs might return it as 'id'
    blobId = storageInfo.id;
  }

  if (!blobId) {
    console.error(
      "Could not extract blobId from Walrus (Web API) response:",
      storageInfo
    );
    throw new Error("Could not extract blobId from Walrus (Web API) response.");
  }

  return { blobId, storageInfo };
}
