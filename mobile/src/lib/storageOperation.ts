let operation: "scan" | "cleanup" | "compression" | null = null;
export async function withStorageOperation<T>(
  kind: "scan" | "cleanup" | "compression",
  work: () => Promise<T>,
): Promise<T> {
  if (operation)
    throw new Error(
      operation === "scan"
        ? "Wait for the scan to finish before cleaning."
        : operation === "compression"
          ? "Photo compression is in progress. Please wait."
          : "Cleanup is in progress. Please wait.",
    );
  operation = kind;
  try {
    return await work();
  } finally {
    operation = null;
  }
}
