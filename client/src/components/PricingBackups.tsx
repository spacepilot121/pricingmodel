import {useEffect,useRef,useState} from 'react';
export default function PricingBackups(){
  const ref=useRef<HTMLDivElement>(null);const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    const mount=()=>{if(!cancelled && ref.current)(window as any).PricingBackup?.mount(ref.current);};
    if((window as any).PricingBackup){mount();return;}
    const script=document.createElement('script');script.src=import.meta.env.BASE_URL+'campaign-backup.js';script.onload=mount;script.onerror=()=>{if(!cancelled)setError('Backup controls could not load. Refresh Settings and retry.');};document.head.append(script);
    return ()=>{cancelled=true;};
  },[]);
  return <section><h3>Pricing backups</h3><div ref={ref} id="pricing-backup-settings" />{error&&<p role="alert">{error}</p>}</section>;
}
