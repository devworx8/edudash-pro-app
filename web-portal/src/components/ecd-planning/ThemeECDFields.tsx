import { DEVELOPMENTAL_DOMAINS, AGE_GROUPS } from '@/types/ecd-planning';

interface ThemeECDFieldsProps {
  ageGroups: string[];
  developmentalDomains: string[];
  onAgeGroupsChange: (groups: string[]) => void;
  onDomainsChange: (domains: string[]) => void;
}

export function ThemeECDFields({
  ageGroups,
  developmentalDomains,
  onAgeGroupsChange,
  onDomainsChange,
}: ThemeECDFieldsProps) {
  return (
    <>
      <div>
        <label className="label">Age Groups</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {AGE_GROUPS.map((age) => (
            <label key={age} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={ageGroups.includes(age)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onAgeGroupsChange([...ageGroups, age]);
                  } else {
                    onAgeGroupsChange(ageGroups.filter((a) => a !== age));
                  }
                }}
              />
              <span>{age} years</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Developmental Domains</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {DEVELOPMENTAL_DOMAINS.map((domain) => (
            <label key={domain} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={developmentalDomains.includes(domain)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onDomainsChange([...developmentalDomains, domain]);
                  } else {
                    onDomainsChange(developmentalDomains.filter((d) => d !== domain));
                  }
                }}
              />
              <span style={{ textTransform: 'capitalize' }}>{domain}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
