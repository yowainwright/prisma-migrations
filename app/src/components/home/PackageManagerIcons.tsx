import { SiNpm, SiYarn, SiPnpm, SiBun } from 'react-icons/si';

interface PackageManagerIconsProps {
  packageManagers: Array<{
    name: string;
    url: string;
    icon: 'npm' | 'yarn' | 'pnpm' | 'bun';
  }>;
}

const iconMap = {
  npm: SiNpm,
  yarn: SiYarn,
  pnpm: SiPnpm,
  bun: SiBun,
};

export default function PackageManagerIcons({ packageManagers }: PackageManagerIconsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 mt-8 sm:mt-10 xl:mt-0">
      {packageManagers.map((pm) => {
        const Icon = iconMap[pm.icon];
        return (
          <a
            key={pm.name}
            href={pm.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-base-200 hover:bg-base-300 transition-colors rounded-xl sm:rounded-2xl flex justify-center items-center aspect-square group min-w-20 min-h-20 sm:min-w-24 sm:min-h-24"
          >
            <Icon
              className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 group-hover:scale-110 transition-transform"
              style={{ color: 'var(--primary-text)' }}
            />
          </a>
        );
      })}
    </div>
  );
}
