import { extensionArchive, extensionDownloadName, extensionVersion } from "@shared/extensionRelease";

export default function ExtensionDownloadLink({ className }: { className: string }) {
  return (
    <a
      className={className}
      href={import.meta.env.DEV ? "/" + extensionArchive : "/assets/" + extensionDownloadName}
      download={extensionDownloadName}
    >
      نزّل إضافة المتصفح <bdi>v{extensionVersion}</bdi>
    </a>
  );
}
