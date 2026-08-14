import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, TimeScale, CategoryScale,
  Filler, Tooltip, Legend
} from 'chart.js';
import { Calculator, Database, Cog, Archive, RefreshCw, Trash2, Plus, Pencil, ChevronDown, Search, ZoomIn, ZoomOut, Maximize, Info, BarChart3, ImagePlus, Sliders, Cake, Lock, Package } from 'lucide-react';
import { api } from '../api';
import { useI18n } from '../i18n';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

/* ==================== Types ==================== */

interface Material {
  id: string; name: string; length: number; width: number; thickness: number; color: string; price: number;
}
interface RodTube {
  id: string; type: 'round-bar' | 'round-tube'; name: string; diameter: number; wallThickness: number | null; length: number; price: number;
}
interface MixedRegion { x: number; y: number; w: number; h: number; cols: number; rows: number; rotated: boolean }
interface CutPlan {
  name: string; plateL: number; plateW: number; productL: number; productW: number;
  horizontal: number; vertical: number; total: number; utilization: number; rotatedProduct: boolean;
  /** 混合排版区域：主区域 + 右侧边角 + 底部边角 */
  mixedRegions?: { main: MixedRegion; right: MixedRegion | null; bottom: MixedRegion | null };
}
interface ParsedDim { value: number; unit: string; }

/* ==================== Constants ==================== */

const DEFAULT_MATERIALS: Material[] = [
  { id: 'standard-122-244', name: '标准板', length: 122, width: 244, thickness: 18, color: '白色', price: 100 },
  { id: 'large-122-305', name: '加长板', length: 122, width: 305, thickness: 18, color: '金色', price: 125 },
  { id: 'square-122-122', name: '方形板', length: 122, width: 122, thickness: 15, color: '蓝色', price: 55 },
];
const DEFAULT_RT: RodTube[] = [
  { id: 'round-bar-10-200', type: 'round-bar', name: '标准圆棒', diameter: 10, wallThickness: null, length: 200, price: 8 },
  { id: 'round-tube-20-2-200', type: 'round-tube', name: '标准圆管', diameter: 20, wallThickness: 2, length: 200, price: 15 },
];

/* ==================== Utils ==================== */

function parseDim(input: string): ParsedDim {
  const m = String(input).trim().toLowerCase().match(/^(\d*\.?\d+)\s*(mm|cm|m|in)?$/);
  if (!m) return { value: NaN, unit: 'cm' };
  const v = Number(m[1]), u = m[2] || 'cm';
  return { value: u === 'mm' ? v / 10 : u === 'm' ? v * 100 : u === 'in' ? v * 2.54 : v, unit: u };
}

function calcCount(plateL: number, plateW: number, prodL: number, prodW: number) {
  const h = Math.floor(plateL / prodL), v = Math.floor(plateW / prodW);
  return { horizontal: h, vertical: v, total: h * v };
}

function computePlans(plateL: number, plateW: number, prodL: number, prodW: number, loss: number) {
  const wl = prodL + loss, ww = prodW + loss, area = prodL * prodW, plateArea = plateL * plateW;
  const defs: [string, number, number, number, number, boolean][] = [
    ['plan_a', plateL, plateW, wl, ww, false],
    ['plan_b', plateL, plateW, ww, wl, true],
  ];
  const plans: CutPlan[] = defs.map(([name, l, w, pl, pw, r]) => {
    const c = calcCount(l, w, pl, pw);
    return { name, plateL: l, plateW: w, productL: pl, productW: pw, ...c, utilization: c.total * area / plateArea * 100, rotatedProduct: r };
  });
  const mixed = computeMixedPlan(plateL, plateW, prodL, prodW, loss, plans);
  if (mixed) plans.push(mixed);
  return { plans, best: plans.reduce((b, p) => p.total > b.total ? p : b) };
}

/** 贪心混合排版：先用最佳方向满排主区域，右侧/底部边角用另一方向填充 */
function computeMixedPlan(plateL: number, plateW: number, prodL: number, prodW: number, loss: number, plans: CutPlan[]): CutPlan | null {
  const wl = prodL + loss, ww = prodW + loss, area = prodL * prodW, plateArea = plateL * plateW;

  // 对两个方向分别做混合排版，取总产量更高的
  const candidates: { plan: CutPlan; regions: CutPlan['mixedRegions'] }[] = [];

  for (const base of plans) {
    const isRot = base.rotatedProduct;
    const pL = isRot ? prodW : prodL, pW = isRot ? prodL : prodW;
    const rL = isRot ? prodL : prodW, rW = isRot ? prodW : prodL;

    const mainCols = base.horizontal, mainRows = base.vertical;
    const usedL = mainCols * (pL + loss);
    const usedW = mainRows * (pW + loss);
    const remL = plateL - usedL, remW = plateW - usedW;

    const mainRegion: MixedRegion = { x: 0, y: 0, w: usedL, h: usedW, cols: mainCols, rows: mainRows, rotated: isRot };

    // 右侧边角填充（旋转方向的产品）
    let right: MixedRegion | null = null;
    if (remW >= rW + loss) {
      const rCols = Math.floor(usedL / (rL + loss));
      const rRows = Math.floor(remW / (rW + loss));
      if (rCols > 0 && rRows > 0) {
        right = { x: usedL, y: 0, w: rCols * (rL + loss), h: rRows * (rW + loss), cols: rCols, rows: rRows, rotated: !isRot };
      }
    }

    // 底部边角填充
    let bottom: MixedRegion | null = null;
    if (remL >= (right ? rW : pL) + loss) {
      const bCols = Math.floor(remL / (rL + loss));
      const bRows = Math.floor((right ? plateW : usedW) / (rW + loss));
      if (bCols > 0 && bRows > 0) {
        bottom = { x: 0, y: usedW, w: bCols * (rL + loss), h: bRows * (rW + loss), cols: bCols, rows: bRows, rotated: !isRot };
      }
    }

    const extraTotal = (right?.cols ?? 0) * (right?.rows ?? 0) + (bottom?.cols ?? 0) * (bottom?.rows ?? 0);
    if (extraTotal === 0) continue;

    const mixedTotal = base.total + extraTotal;
    candidates.push({
      plan: {
        name: 'plan_c',
        plateL, plateW,
        productL: pL, productW: pW,
        horizontal: base.horizontal,
        vertical: base.vertical,
        total: mixedTotal,
        utilization: mixedTotal * area / plateArea * 100,
        rotatedProduct: isRot,
      },
      regions: { main: mainRegion, right, bottom },
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.plan.total - a.plan.total);
  const best = candidates[0];
  best.plan.mixedRegions = best.regions;
  return best.plan;
}

/* ==================== Main Component ==================== */

type Tab = 'calculator' | 'materials' | 'rodTubeCalc' | 'rodTubeLibrary' | 'costing' | 'packing';
type ModalType = 'none' | 'materialEditor' | 'rodTubeEditor' | 'authorSecret' | 'birthday';

export default function BoardCalculator() {
  const { t } = useI18n();
  /* ---- Tab & Modal state ---- */
  const [tab, setTab] = useState<Tab>('calculator');
  const [modal, setModal] = useState<ModalType>('none');
  const [toast, setToast] = useState('');
  const [easterEggPreview, setEasterEggPreview] = useState('');

  /* ---- Materials ---- */
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [rodsLoaded, setRodsLoaded] = useState(false);
  const [selMatId, setSelMatId] = useState('');
  const [editMatId, setEditMatId] = useState<string | null>(null);
  const [matSearch, setMatSearch] = useState('');
  const [matLibSearch, setMatLibSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const selMat = materials.find(m => m.id === selMatId) || materials[0];

  useEffect(() => {
    api.getBoardMaterials().then((data: Material[]) => {
      if (data && data.length > 0) {
        setMaterials(data);
        setSelMatId(data[0].id);
      }
    }).catch(() => {
      // API 失败时回退到默认板材，避免界面空白
      const defaults = DEFAULT_MATERIALS.map(m => ({ ...m }));
      setMaterials(defaults);
      setSelMatId(defaults[0].id);
    }).finally(() => setMaterialsLoaded(true));
    api.getRodTubes().then((data: RodTube[]) => {
      if (data && data.length > 0) setRtMaterials(data);
    }).catch(() => {}).finally(() => setRodsLoaded(true));
  }, []);

  /* ---- Rod/Tube ---- */
  const [rtMaterials, setRtMaterials] = useState<RodTube[]>(DEFAULT_RT.map(m => ({ ...m })));
  const [selRtId, setSelRtId] = useState(rtMaterials[0]?.id || '');
  const [editRtId, setEditRtId] = useState<string | null>(null);
  const [rtSearch, setRtSearch] = useState('');
  const [rtLibSearch, setRtLibSearch] = useState('');
  const [rtPickerOpen, setRtPickerOpen] = useState(false);

  const selRt = rtMaterials.find(r => r.id === selRtId) || rtMaterials[0];

  useEffect(() => {
    if (rodsLoaded) api.saveRodTubes(rtMaterials).catch(() => {});
  }, [rtMaterials, rodsLoaded]);

  /* ---- Calculator inputs ---- */
  const [prodLength, setProdLength] = useState('');
  const [prodWidth, setProdWidth] = useState('');
  const [cutLoss, setCutLoss] = useState('5');
  const [platePrice, setPlatePrice] = useState(String(selMat?.price ?? ''));

  // 首次加载板材时自动同步价格（此后由用户手动编辑或下拉选择覆盖）
  useEffect(() => {
    if (materialsLoaded && selMat) {
      setPlatePrice(String(selMat.price));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialsLoaded]);
  const [result, setResult] = useState<{ plans: CutPlan[]; best: CutPlan; lUnit: string; wUnit: string } | null>(null);
  const [error, setError] = useState('');

  /* ---- Chart history ---- */
  const [history, setHistory] = useState<{ utilization: number; time: string; planName: string }[]>([]);
  /* ---- USD exchange rate ---- */
  const [usdRate, setUsdRate] = useState('6.75');

  /* ---- Rod/Tube calculator ---- */
  const [rtReqLen, setRtReqLen] = useState('');
  const [rtLoss, setRtLoss] = useState('1.5');
  const [rtPrice, setRtPrice] = useState(String(selRt?.price ?? ''));
  const [rtResult, setRtResult] = useState<{ pieces: number; costPer: number; utilization: number; formula: string; typeLabel: string; name: string } | null>(null);
  const [rtError, setRtError] = useState('');

  /* ---- SVG zoom ---- */
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgTransform, setSvgTransform] = useState({ scale: 1, x: 0, y: 0 });

  /* ---- Auto-calculate timer ---- */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ==================== Calculator Logic ==================== */

  const doCalc = useCallback(() => {
    if (!selMat) return;
    const plateL = selMat.length, plateW = selMat.width;
    const price = Number(platePrice), lossMm = Number(cutLoss);
    const l = parseDim(prodLength), w = parseDim(prodWidth);
    if (![plateL, plateW, price, lossMm, l.value, w.value].every(Number.isFinite) || plateL <= 0 || plateW <= 0 || price < 0 || lossMm < 0 || l.value <= 0 || w.value <= 0) {
      setError(t('calc.error_invalid_dims'));
      setResult(null);
      return;
    }
    const { plans, best } = computePlans(plateL, plateW, l.value, w.value, lossMm / 10);
    if (!best.total) { setError(t('calc.error_no_cut')); setResult(null); return; }
    setError('');
    setResult({ plans, best, lUnit: l.unit.toUpperCase(), wUnit: w.unit.toUpperCase() });
    setHistory(prev => {
      const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return [{ utilization: Number(best.utilization.toFixed(2)), time: now, planName: best.name }, ...prev].slice(0, 10);
    });
  }, [selMat, platePrice, cutLoss, prodLength, prodWidth]);

  const scheduleCalc = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (prodLength.trim() && prodWidth.trim()) timerRef.current = setTimeout(doCalc, 500);
  }, [doCalc, prodLength, prodWidth]);

  useEffect(() => { scheduleCalc(); return () => { if (timerRef.current) clearTimeout(timerRef.current); }; }, [prodLength, prodWidth, cutLoss, platePrice, selMat]);

  const resetCalc = () => {
    setProdLength(''); setProdWidth(''); setCutLoss('5'); setPlatePrice(String(selMat?.price ?? ''));
    setResult(null); setError(''); setHistory([]);
    if (svgRef.current) setSvgTransform({ scale: 1, x: 0, y: 0 });
  };

  /* ==================== Rod/Tube Logic ==================== */

  const doRtCalc = () => {
    if (!selRt) return;
    const item = selRt;
    const parsed = parseDim(rtReqLen);
    if (!parsed || !Number.isFinite(parsed.value) || parsed.value <= 0) { setRtError(t('calc.error_req_length')); return; }
    const reqCm = parsed.value, lossMm = Number(rtLoss);
    if (!Number.isFinite(lossMm) || lossMm < 0) { setRtError(t('calc.error_loss')); return; }
    const lossCm = lossMm / 10, rodLen = item.length, rodPrice = Number(rtPrice);
    if (rodPrice < 0) { setRtError(t('calc.error_neg_price')); return; }
    const total = reqCm + lossCm, pieces = Math.floor(rodLen / total);
    if (pieces <= 0) { setRtError(t('calc.error_too_long')); return; }
    const costPer = rodPrice / pieces, utilization = pieces * total / rodLen * 100;
    const typeLabel = item.type;
    setRtError('');
    setRtResult({
      pieces, costPer, utilization,
      formula: `¥${rodPrice.toFixed(2)} ÷ floor(${rodLen} cm ÷ (${reqCm.toFixed(2)} cm + ${lossCm.toFixed(2)} cm)) = ¥${rodPrice.toFixed(2)} ÷ ${pieces}`,
      typeLabel, name: item.name
    });
  };

  /* ==================== Material CRUD ==================== */

  const [matForm, setMatForm] = useState({ name: '', length: '', width: '', thickness: '', color: '白色', price: '' });

  const openMatEditor = (m?: Material) => {
    setEditMatId(m?.id || null);
    setMatForm({ name: m?.name || '', length: String(m?.length || ''), width: String(m?.width || ''), thickness: String(m?.thickness || ''), color: m?.color || '白色', price: String(m?.price ?? '') });
    setModal('materialEditor');
  };

  const saveMat = () => {
    const { name, length, width, thickness, color, price } = matForm;
    const l = Number(length), w = Number(width), t = Number(thickness), p = Number(price), c = color.trim();
    if (!name.trim() || ![l, w, t, p].every(Number.isFinite) || l <= 0 || w <= 0 || t <= 0 || p < 0 || !c) return;
    const mat: Material = { id: editMatId || `material-${Date.now()}`, name: name.trim(), length: l, width: w, thickness: t, color: c, price: p };
    const updated = editMatId ? materials.map(m => m.id === editMatId ? mat : m) : [...materials, mat];
    setMaterials(updated);
    api.saveBoardMaterials(updated).catch(() => {});
    if (selMatId === mat.id || !selMatId) setSelMatId(mat.id);
    setModal('none');
  };

  const deleteMat = (id: string) => {
    if (materials.length === 1) return;
    const updated = materials.filter(m => m.id !== id);
    setMaterials(updated);
    api.saveBoardMaterials(updated).catch(() => {});
    if (selMatId === id) setSelMatId(materials.find(m => m.id !== id)?.id || '');
  };

  /* ==================== RodTube CRUD ==================== */

  const [rtForm, setRtForm] = useState({ type: 'round-bar' as 'round-bar' | 'round-tube', name: '', diameter: '', wallThickness: '', length: '', price: '' });

  const openRtEditor = (r?: RodTube) => {
    setEditRtId(r?.id || null);
    setRtForm({ type: r?.type || 'round-bar', name: r?.name || '', diameter: String(r?.diameter || ''), wallThickness: String(r?.wallThickness ?? ''), length: String(r?.length || ''), price: String(r?.price ?? '') });
    setModal('rodTubeEditor');
  };

  const saveRt = () => {
    const { type, name, diameter, length, price, wallThickness } = rtForm;
    const d = Number(diameter), l = Number(length), p = Number(price);
    if (!name.trim() || ![d, l, p].every(Number.isFinite) || d <= 0 || l <= 0 || p < 0) return;
    if (type === 'round-tube') {
      const wt = Number(wallThickness);
      if (!Number.isFinite(wt) || wt <= 0) return;
    }
    const rt: RodTube = { id: editRtId || `rt-${Date.now()}`, type, name: name.trim(), diameter: d, length: l, price: p, wallThickness: type === 'round-tube' ? Number(wallThickness) : null };
    const updated = editRtId ? rtMaterials.map(r => r.id === editRtId ? rt : r) : [...rtMaterials, rt];
    setRtMaterials(updated);
    api.saveRodTubes(updated).catch(() => {});
    if (selRtId === rt.id || !selRtId) setSelRtId(rt.id);
    setModal('none');
  };

  const deleteRt = (id: string) => {
    if (rtMaterials.length === 1) return;
    const updated = rtMaterials.filter(r => r.id !== id);
    setRtMaterials(updated);
    api.saveRodTubes(updated).catch(() => {});
    if (selRtId === id) setSelRtId(rtMaterials.find(r => r.id !== id)?.id || '');
  };

  /* ==================== Easter eggs ==================== */

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 5000); };
  const today = new Date();
  const isBirthday = today.getMonth() === 7 && today.getDate() === 8;
  const birthdayGreeting = isBirthday
    ? (today.getFullYear() - 2026 <= 0 ? t('calc.birthday_launch')
      : ((today.getFullYear() - 2026) % 2 === 0 ? t('calc.birthday_even', { n: today.getFullYear() - 2026 }) : t('calc.birthday_anniv', { n: today.getFullYear() - 2026 })))
    : '';

  /* ==================== SVG Visualization ==================== */

  const renderSVG = useCallback((plan: CutPlan, mainColor: string = '#007AFF', noCenter: boolean = false) => {
    const padding = 30, size = Math.max(plan.plateL, plan.plateW) + padding * 2;
    const px = (size - plan.plateL) / 2, py = (size - plan.plateW) / 2;
    const rects: JSX.Element[] = [];
    rects.push(<rect key="bg" x={px} y={py} width={plan.plateL} height={plan.plateW} fill="rgba(251,113,133,.15)" stroke={mainColor} strokeOpacity=".15" />);

    if (plan.mixedRegions) {
      const { main, right, bottom } = plan.mixedRegions;
      // 主区域
      const mw = main.cols * plan.productL, mh = main.rows * plan.productW;
      const mx0 = px + main.x, my0 = py + main.y;
      for (let x = 0; x < main.cols; x++)
        for (let y = 0; y < main.rows; y++)
          rects.push(<rect key={`m-${x}-${y}`} x={mx0 + x * plan.productL} y={my0 + y * plan.productW} width={plan.productL} height={plan.productW} fill={mainColor} stroke={mainColor} strokeOpacity=".6" />);
      // 右侧边角（橙色系，产品旋转90°）
      if (right) {
        const rPL = right.rotated ? plan.productW : plan.productL;
        const rPW = right.rotated ? plan.productL : plan.productW;
        const rx0 = px + right.x, ry0 = py + right.y;
        for (let x = 0; x < right.cols; x++)
          for (let y = 0; y < right.rows; y++)
            rects.push(<rect key={`rr-${x}-${y}`} x={rx0 + x * rPL} y={ry0 + y * rPW} width={rPL} height={rPW} fill="#FF9500" stroke="#FFB340" />);
      }
      // 底部边角（绿色系）
      if (bottom) {
        const bPL = bottom.rotated ? plan.productW : plan.productL;
        const bPW = bottom.rotated ? plan.productL : plan.productW;
        const bx0 = px + bottom.x, by0 = py + bottom.y;
        for (let x = 0; x < bottom.cols; x++)
          for (let y = 0; y < bottom.rows; y++)
            rects.push(<rect key={`br-${x}-${y}`} x={bx0 + x * bPL} y={by0 + y * bPW} width={bPL} height={bPW} fill="#34C759" stroke="#6EDC8C" />);
      }
    } else {
      const usedW = plan.horizontal * plan.productL, usedH = plan.vertical * plan.productW;
      const mx = noCenter ? 0 : (plan.plateL - usedW) / 2;
      const my = noCenter ? 0 : (plan.plateW - usedH) / 2;
      for (let x = 0; x < plan.horizontal; x++)
        for (let y = 0; y < plan.vertical; y++)
          rects.push(<rect key={`${x}-${y}`} x={px + mx + x * plan.productL} y={py + my + y * plan.productW} width={plan.productL} height={plan.productW} fill={mainColor} stroke={mainColor} strokeOpacity=".6" />);
    }

    return { svg: <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" style={{ cursor: 'grab' }}>{rects}</svg>, size };
  }, []);

  /** 合并渲染：所有方案绘制在同一张原材料板上，不同方案不同颜色叠加对比 */
  const renderCombinedSVG = useCallback((plans: CutPlan[]) => {
    const plateL = plans[0].plateL, plateW = plans[0].plateW;
    const padding = 30, size = Math.max(plateL, plateW) + padding * 2;
    const px = (size - plateL) / 2, py = (size - plateW) / 2;
    const rects: JSX.Element[] = [];
    // 单张板材底色
    rects.push(<rect key="bg" x={px} y={py} width={plateL} height={plateW} fill="rgba(251,113,133,.15)" stroke="rgba(0,122,255,.15)" />);

    const colors = ['#007AFF', '#AF52DE', '#FF9500']; // A蓝 B紫 C橙

    plans.forEach((plan, pi) => {
      const color = colors[pi] || '#007AFF';
      const isACentered = plan.name === 'plan_a' && plans.length >= 3;
      const noCenter = !isACentered;

      if (plan.mixedRegions) {
        const { main, right, bottom } = plan.mixedRegions;
        const mx0 = px + main.x, my0 = py + main.y;
        for (let x = 0; x < main.cols; x++)
          for (let y = 0; y < main.rows; y++)
            rects.push(<rect key={`p${pi}-m-${x}-${y}`} x={mx0 + x * plan.productL} y={my0 + y * plan.productW} width={plan.productL} height={plan.productW} fill={color} stroke={color} strokeOpacity=".5" fillOpacity=".45" />);
        if (right) {
          // 混合排版中，右侧/底部区域的产品尺寸恒为 plan 主方向的交换维度
          const rPL = plan.productW;
          const rPW = plan.productL;
          const rx0 = px + right.x, ry0 = py + right.y;
          for (let x = 0; x < right.cols; x++)
            for (let y = 0; y < right.rows; y++)
              rects.push(<rect key={`p${pi}-rr-${x}-${y}`} x={rx0 + x * rPL} y={ry0 + y * rPW} width={rPL} height={rPW} fill="#FF9500" stroke="#FFB340" strokeOpacity=".5" fillOpacity=".45" />);
        }
        if (bottom) {
          const bPL = plan.productW;
          const bPW = plan.productL;
          const bx0 = px + bottom.x, by0 = py + bottom.y;
          for (let x = 0; x < bottom.cols; x++)
            for (let y = 0; y < bottom.rows; y++)
              rects.push(<rect key={`p${pi}-br-${x}-${y}`} x={bx0 + x * bPL} y={by0 + y * bPW} width={bPL} height={bPW} fill="#34C759" stroke="#6EDC8C" strokeOpacity=".5" fillOpacity=".45" />);
        }
      } else {
        const usedW = plan.horizontal * plan.productL;
        const usedH = plan.vertical * plan.productW;
        const mx = noCenter ? 0 : (plateL - usedW) / 2;
        const my = noCenter ? 0 : (plateW - usedH) / 2;
        for (let x = 0; x < plan.horizontal; x++)
          for (let y = 0; y < plan.vertical; y++)
            rects.push(<rect key={`p${pi}-${x}-${y}`} x={px + mx + x * plan.productL} y={py + my + y * plan.productW} width={plan.productL} height={plan.productW} fill={color} stroke={color} strokeOpacity=".5" fillOpacity=".35" />);
      }
    });

    return <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" style={{ cursor: 'grab' }}>{rects}</svg>;
  }, []);

  /* ==================== Chart data ==================== */

  const planKeyMap: Record<string, string> = { plan_a: '#007AFF', plan_b: '#AF52DE', plan_c: '#FF9500' };
  const planKeys = ['plan_a', 'plan_b', 'plan_c'];
  const planColors = ['#007AFF', '#AF52DE', '#FF9500'];
  const reversedHistory = history.length ? [...history].reverse() : [];
  const chartData = {
    labels: reversedHistory.map(h => h.time),
    datasets: planKeys.map((key, i) => ({
      label: t(`calc.${key}`),
      data: reversedHistory.map(h => h.planName === key ? h.utilization : null),
      borderColor: planColors[i],
      backgroundColor: planColors[i] + '14',
      fill: false,
      tension: 0.4,
      pointRadius: 3,
      borderWidth: 2,
      spanGaps: false,
    })).filter(ds => ds.data.some(v => v !== null)),
  };
  const chartOpts = { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#8E8E93', font: { size: 11 } } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { color: '#8E8E93', font: { size: 11 } }, grid: { color: 'rgba(56,56,58,.5)' } }, x: { ticks: { color: '#8E8E93', font: { size: 11 } }, grid: { display: false } } } };

  /* ==================== Keyboard shortcuts ==================== */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal('none'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ==================== Styles ==================== */

  const inputCls = "w-full bg-apple-secondary border border-apple-border rounded-apple px-3.5 py-2.5 text-sm text-apple-text placeholder-apple-text-secondary outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 transition";
  const btnPrimary = "w-full bg-apple-blue text-white rounded-apple py-3 text-sm font-semibold hover:brightness-110 transition";
  const glassCard = "bg-apple-card/80 backdrop-blur-apple border border-apple-border/50 rounded-[20px] p-6";
  const statCard = "bg-apple-secondary/60 border border-apple-border/30 rounded-[18px] p-5";
  const segActive = "bg-apple-blue/20 text-white rounded-[11px] px-4 py-2 text-[13px] font-medium cursor-pointer whitespace-nowrap";
  const segInactive = "text-apple-text-secondary rounded-[11px] px-4 py-2 text-[13px] font-medium cursor-pointer hover:text-apple-text transition whitespace-nowrap";
  const ghostBtn = "text-apple-text-secondary hover:text-apple-text text-xs bg-transparent border border-apple-border/30 rounded-[12px] px-3.5 py-1.5 transition hover:border-apple-border";
  const dangerBtn = "text-red-400 hover:text-red-300 text-xs bg-transparent border border-red-400/20 rounded-[12px] px-3.5 py-1.5 transition hover:bg-red-400/8";

  /* ==================== Render ==================== */

  const filteredMats = materials.filter(m => m.name.toLowerCase().includes(matSearch.toLowerCase()));

  return (
    <div className="h-full bg-apple-bg text-apple-text overflow-y-auto">
      <div className="max-w-6xl xl:max-w-7xl mx-auto px-5 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight bg-gradient-to-r from-apple-blue via-purple-400 to-apple-blue bg-clip-text text-transparent">{t('calc.title')}</h1>
            <p className="text-xs text-apple-text-secondary mt-1">{t('calc.subtitle')}</p>
          </div>
          <button onClick={resetCalc} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5 inline mr-1" />{t('calc.reset')}</button>
        </header>

        {/* Tab bar */}
        <nav className="mb-8">
          <div className="flex overflow-x-auto bg-apple-secondary/60 border border-apple-border/30 rounded-[14px] p-1 backdrop-blur mx-auto w-fit max-w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {([
              ['calculator', Calculator, t('calc.tab_calculator')],
              ['costing', BarChart3, t('calc.tab_costing')],
              ['packing', Package, t('calc.tab_packing')],
              ['materials', Database, t('calc.tab_materials')],
              ['rodTubeCalc', Cog, t('calc.tab_rod_calc')],
              ['rodTubeLibrary', Archive, t('calc.tab_rod_library')],
            ] as const).map(([key, Icon, label]) => (
              <button key={key} onClick={() => setTab(key)} className={tab === key ? segActive : segInactive}>
                <Icon className="w-3.5 h-3.5 inline mr-1" />{label}
              </button>
            ))}
          </div>
        </nav>

        {/* ============ CALCULATOR TAB ============ */}
        {tab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Parameters */}
            <section className={glassCard}>
              <h2 className="flex items-center gap-2 text-base font-semibold mb-5"><Sliders className="w-4 h-4 text-apple-blue" />{t('calc.params')}</h2>
              {/* Material search & picker */}
              <div className="relative mb-4">
                <label className="text-sm block mb-1">{t('calc.search_board')}</label>
                <input type="search" placeholder={t('calc.search_board_placeholder')} className={inputCls} value={matSearch}
                  onChange={e => { setMatSearch(e.target.value); setPickerOpen(true); }}
                  onFocus={() => setPickerOpen(true)}
                  onKeyDown={e => { if (e.key === 'Enter' && filteredMats.length) { const m = filteredMats[0]; setSelMatId(m.id); setPlatePrice(String(m.price)); setPickerOpen(false); setMatSearch(''); } }} />
              </div>
              <div className="relative mb-4">
                <button onClick={() => setPickerOpen(!pickerOpen)} className={`${inputCls} flex items-center justify-between text-left`}>
                  {selMat ? <span className="text-sm truncate flex items-center min-w-0"><span className="truncate">{selMat.name} · {selMat.length} × {selMat.width} cm · {t('calc.thickness_short')} {selMat.thickness} mm</span><span className="ml-2 text-xs text-apple-text-secondary shrink-0">{selMat.color}</span></span> : !materialsLoaded ? <span className="text-apple-text-secondary">{t('calc.loading_boards')}</span> : <span className="text-apple-text-secondary">{t('calc.select_board')}</span>}
                  <ChevronDown className="w-4 h-4 text-apple-text-secondary shrink-0" />
                </button>
                {pickerOpen && (
                  <div className="absolute z-30 mt-2 w-full max-h-60 overflow-y-auto bg-apple-card border border-apple-border/30 rounded-[18px] shadow-xl backdrop-blur p-1.5">
                    {filteredMats.length === 0 ? <p className="px-3 py-4 text-center text-sm text-apple-text-secondary">{t('calc.no_board_match')}</p>
                      : filteredMats.map(m => (
                        <button key={m.id} onClick={() => { setSelMatId(m.id); setPickerOpen(false); setMatSearch(''); setPlatePrice(String(m.price)); }}
                          className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${m.id === selMatId ? 'bg-apple-blue/20 text-white' : 'hover:bg-white/5'}`}>
                          <span className="truncate">{m.name} · {m.length} × {m.width} cm · {t('calc.thickness_short')} {m.thickness} mm</span>
                          <span className="rounded-md px-2 py-0.5 text-xs bg-apple-blue/10 text-apple-text-secondary shrink-0 ml-2">{m.color}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <label className="text-sm block mb-4">{t('calc.board_price')}
                <input type="number" min="0" step="0.01" className={inputCls} value={platePrice} onChange={e => setPlatePrice(e.target.value)} />
                <span className="block text-[11px] text-apple-text-secondary mt-1">{t('calc.board_price_tip')}</span>
              </label>
              <label className="text-sm block mb-4">{t('calc.usd_rate')}
                <input type="number" min="0.01" step="0.01" className={inputCls} value={usdRate} onChange={e => setUsdRate(e.target.value)} />
                <span className="block text-[11px] text-apple-text-secondary mt-1">{t('calc.usd_rate_tip')}</span>
              </label>
              <hr className="border-apple-border/30 my-5" />
              <label className="text-sm block mb-4">{t('calc.prod_length')} <span className="text-xs text-apple-text-secondary">(mm/cm/m/in)</span>
                <input type="text" inputMode="decimal" placeholder={t('calc.prod_length_placeholder')} className={inputCls} value={prodLength} onChange={e => setProdLength(e.target.value)} />
              </label>
              <label className="text-sm block mb-4">{t('calc.prod_width')} <span className="text-xs text-apple-text-secondary">(mm/cm/m/in)</span>
                <input type="text" inputMode="decimal" placeholder={t('calc.prod_width_placeholder')} className={inputCls} value={prodWidth} onChange={e => setProdWidth(e.target.value)} />
              </label>
              <label className="text-sm block mb-4">{t('calc.cut_loss')}<span className="text-xs text-apple-text-secondary ml-1">{t('calc.cut_loss_tip')}</span>
                <input type="number" min="0" step="0.1" className={inputCls} value={cutLoss} onChange={e => setCutLoss(e.target.value)} />
              </label>
              <button onClick={doCalc} className={btnPrimary}><Calculator className="w-4 h-4 inline mr-2" />{t('calc.start_calc')}</button>
              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            </section>

            {/* Right: Results */}
            <section className="space-y-6 lg:col-span-2">
              <div className={glassCard}>
                <h2 className="flex items-center gap-2 text-base font-semibold mb-5"><BarChart3 className="w-4 h-4 text-apple-blue" />{t('calc.cut_plan')}</h2>
                {result ? (
                  <>
                    <div className="border-l-[3px] border-apple-blue bg-apple-blue/5 rounded-xl p-4 mb-5">
                      <p className="font-medium">{t('calc.best_plan_prefix')}{t(`calc.${result.best.name}`)} · {t('calc.yield')} {result.best.total} {t('calc.pieces')} · {t('calc.utilization')} {result.best.utilization.toFixed(2)}%</p>
                      <p className="text-sm text-apple-text-secondary mt-1">{result.best.mixedRegions ? t('calc.mixed_desc') : result.best.rotatedProduct ? t('calc.rotated_desc') : t('calc.standard_desc')}</p>
                    </div>
                    <h3 className="text-xs font-medium text-apple-text-secondary uppercase tracking-wider mb-3">{t('calc.all_directions')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                      {result.plans.map(p => (
                        <div key={p.name} className={`rounded-2xl border p-4 ${p === result.best ? 'border-apple-blue/50 bg-apple-blue/5' : 'border-apple-border/20 bg-apple-secondary/20'}`}>
                          <div className="flex justify-between gap-2">
                            <span className="font-bold text-sm">{t(`calc.${p.name}`)}</span>
                            {p === result.best && <span className="whitespace-nowrap rounded-full bg-apple-blue/40 px-2 py-0.5 text-[10px]">{t('calc.best_badge')}</span>}
                          </div>
                          <div className="mt-2 space-y-1 text-xs">
                            <div>{t('calc.per_board_qty')}<strong className="text-apple-blue">{p.total} {t('calc.pieces')}</strong></div>
                            <div>{t('calc.utilization')}：{p.utilization.toFixed(2)}%</div>
                            <div>{t('calc.material_cost')}<strong className="text-green-400">¥{(Number(platePrice) / p.total).toFixed(2)}</strong> / <span className="text-apple-text-secondary">${(Number(platePrice) / p.total / Number(usdRate || 6.75)).toFixed(3)}</span></div>
                            <div>{t('calc.arrangement')}{p.mixedRegions ? <><span className="text-apple-blue">{p.mixedRegions.main.cols}×{p.mixedRegions.main.rows}</span> + <span className="text-orange-400">{t('calc.right_short')}{p.mixedRegions.right?.cols ?? 0}×{p.mixedRegions.right?.rows ?? 0}</span> + <span className="text-green-400">{t('calc.bottom_short')}{p.mixedRegions.bottom?.cols ?? 0}×{p.mixedRegions.bottom?.rows ?? 0}</span></> : <>{p.horizontal} × {p.vertical}</>}</div>
                            <div className="text-apple-text-secondary">{t('calc.product_with_loss')}{p.productL.toFixed(1)} × {p.productW.toFixed(1)} cm</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <h3 className="text-xs font-medium text-apple-text-secondary uppercase tracking-wider mb-3">{t('calc.cost_analysis')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className={statCard}><p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">{t('calc.board_utilization')}</p><p className="text-2xl font-bold text-apple-blue">{result.best.utilization.toFixed(2)}%</p></div>
                      <div className={statCard}><p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">{t('calc.unit_material_cost')}</p><p className="text-2xl font-bold text-green-400">¥{(Number(platePrice) / result.best.total).toFixed(2)}</p></div>
                      <div className={statCard}><p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">{t('calc.max_yield')}</p><p className="text-2xl font-bold text-purple-400">{result.best.total} {t('calc.pieces')}</p></div>
                    </div>
                    {birthdayGreeting && <p className="mt-4 text-xs text-apple-text-secondary">{birthdayGreeting}</p>}
                  </>
                ) : (
                  <div className="py-12 text-center text-apple-text-secondary"><Info className="w-10 h-10 mx-auto mb-4 text-apple-secondary" />{t('calc.enter_params_hint')}</div>
                )}
              </div>

              {/* Chart */}
              <div className={glassCard}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="flex items-center gap-2 text-base font-semibold"><BarChart3 className="w-4 h-4 text-apple-blue" />{t('calc.util_trend')}</h2>
                  <button onClick={() => setHistory([])} className={dangerBtn}><Trash2 className="w-3.5 h-3.5 inline mr-1" />{t('calc.clear_history')}</button>
                </div>
                <div className="h-60"><Line data={chartData} options={chartOpts} /></div>
                <p className="mt-2 text-center text-xs text-apple-text-secondary">{t('calc.util_trend_desc')}</p>
              </div>

              {/* Visualization */}
              <div className={glassCard}>
                <h2 className="flex items-center gap-2 text-base font-semibold mb-5"><ImagePlus className="w-4 h-4 text-apple-blue" />{t('calc.visual_layout')}</h2>
                {result ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-apple-text-secondary">
                        {t('calc.all_plans_overlay')}{result.plans.length >= 3 ? t('calc.overlay_3plans') : t('calc.overlay_simple')}
                      </span>
                      <span className="flex gap-2">
                        <button onClick={() => setSvgTransform(s => ({ ...s, scale: Math.min(4, s.scale * 1.2) }))} className="rounded-xl p-2 hover:bg-white/5 bg-apple-secondary/40"><ZoomIn className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setSvgTransform(s => ({ ...s, scale: Math.max(0.4, s.scale / 1.2) }))} className="rounded-xl p-2 hover:bg-white/5 bg-apple-secondary/40"><ZoomOut className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setSvgTransform({ scale: 1, x: 0, y: 0 })} className="rounded-xl p-2 hover:bg-white/5 bg-apple-secondary/40"><Maximize className="w-3.5 h-3.5" /></button>
                      </span>
                    </div>
                    <div className="relative overflow-hidden rounded-2xl border border-apple-border/20 bg-apple-secondary/20">
                      <div className="h-80 bg-[image:linear-gradient(to_right,rgba(0,122,255,.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,122,255,.03)_1px,transparent_1px)] bg-[size:28px_28px]">
                        <div style={{ transform: `scale(${svgTransform.scale})`, transformOrigin: 'center', height: '100%' }}>
                          {renderCombinedSVG(result.plans)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-center gap-6 text-[11px] text-apple-text-secondary">
                      {result.plans.map((p, i) => {
                        const colors = ['#007AFF', '#AF52DE', '#FF9500'];
                        return <span key={p.name}><span className="inline-block w-3 h-3 mr-1 align-middle rounded-sm" style={{ backgroundColor: colors[i] || '#007AFF' }} />{t(`calc.${p.name}`)}</span>;
                      })}
                      <span><span className="inline-block w-3 h-3 border border-apple-text-secondary mr-1 align-middle" />{t('calc.board_boundary')}</span>
                      <span><span className="inline-block w-3 h-3 bg-red-400 mr-1 align-middle" />{t('calc.remaining_area')}</span>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center text-apple-text-secondary"><ImagePlus className="w-10 h-10 mx-auto mb-4 text-apple-secondary" />{t('calc.after_calc_hint')}</div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ============ COSTING TAB ============ */}
        {tab === 'costing' && <CostingTab materials={materials} materialsLoaded={materialsLoaded} />}
        {tab === 'packing' && <PackingTab />}

        {/* ============ MATERIAL LIBRARY TAB ============ */}
        {tab === 'materials' && (
          <div className="max-w-4xl mx-auto">
            <div className={glassCard}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold"><Database className="w-5 h-5 text-apple-blue" />{t('calc.board_library')}</h2>
                  <p className="text-sm text-apple-text-secondary mt-1">{t('calc.board_format')}</p>
                </div>
                <button onClick={() => openMatEditor()} className="bg-apple-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:brightness-110 transition"><Plus className="w-3.5 h-3.5 inline mr-1" />{t('calc.new_board')}</button>
              </div>
              <input type="search" placeholder={t('calc.search_library_placeholder')} className={inputCls + ' mb-4'} value={matLibSearch} onChange={e => setMatLibSearch(e.target.value)} />
              {materials.filter(m => m.name.toLowerCase().includes(matLibSearch.toLowerCase())).length === 0 ? (
                <p className="py-10 text-center text-sm text-apple-text-secondary">{materials.length ? t('calc.no_board_match') : t('calc.board_lib_empty')}</p>
              ) : (
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {materials.filter(m => m.name.toLowerCase().includes(matLibSearch.toLowerCase())).map(m => (
                    <div key={m.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-apple-border/20 bg-apple-secondary/20 p-4">
                      <p className="text-sm">{m.name} · {m.length} × {m.width} cm · {t('calc.thickness_short')} {m.thickness} mm · ¥{m.price.toFixed(2)} <span className="rounded-md px-2 py-0.5 text-xs bg-apple-blue/10 text-apple-text-secondary">{m.color}</span></p>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => openMatEditor(m)} className={ghostBtn}><Pencil className="w-3 h-3 inline mr-1" />{t('btn.edit')}</button>
                        <button onClick={() => { if (materials.length > 1) deleteMat(m.id); }} className={dangerBtn}><Trash2 className="w-3 h-3 inline mr-1" />{t('btn.delete')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ ROD/TUBE CALCULATOR TAB ============ */}
        {tab === 'rodTubeCalc' && (
          <div className="max-w-4xl mx-auto">
            <div className={glassCard}>
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-5"><Cog className="w-5 h-5 text-apple-blue" />{t('calc.rod_calc_title')}</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="relative">
                    <label className="text-sm block mb-1">{t('calc.search_material')}</label>
                    <input type="search" placeholder={t('calc.search_material_placeholder')} className={inputCls} value={rtSearch}
                      onChange={e => { setRtSearch(e.target.value); setRtPickerOpen(true); }}
                      onFocus={() => setRtPickerOpen(true)}
                      onKeyDown={e => { if (e.key === 'Enter') { const kw = rtSearch.toLowerCase(); const m = rtMaterials.find(r => r.name.toLowerCase().includes(kw)); if (m) { setSelRtId(m.id); setRtPrice(String(m.price)); setRtPickerOpen(false); setRtSearch(''); } } }} />
                  </div>
                  <div className="relative">
                    <button onClick={() => setRtPickerOpen(!rtPickerOpen)} className={`${inputCls} flex items-center justify-between text-left`}>
                      {selRt ? <span className="text-sm">{selRt.type === 'round-bar' ? `${selRt.name} · Φ${selRt.diameter}mm` : `${selRt.name} · Φ${selRt.diameter}×${selRt.wallThickness}mm`} · {t('calc.length_short')} {selRt.length} cm <span className={`ml-2 rounded-md px-2 py-0.5 text-xs ${selRt.type === 'round-bar' ? 'bg-blue-900/40 text-blue-300' : 'bg-green-900/40 text-green-300'}`}>{selRt.type === 'round-bar' ? t('calc.round_bar') : t('calc.round_tube')}</span></span> : <span className="text-apple-text-secondary">{t('calc.select_material')}</span>}
                      <ChevronDown className="w-4 h-4 text-apple-text-secondary shrink-0" />
                    </button>
                    {rtPickerOpen && (
                      <div className="absolute z-30 mt-2 w-full max-h-60 overflow-y-auto bg-apple-card border border-apple-border/30 rounded-[18px] shadow-xl backdrop-blur p-1.5">
                        {rtMaterials.filter(r => r.name.toLowerCase().includes(rtSearch.toLowerCase())).length === 0 ? <p className="px-3 py-4 text-center text-sm text-apple-text-secondary">{t('calc.no_material_match')}</p>
                          : rtMaterials.filter(r => r.name.toLowerCase().includes(rtSearch.toLowerCase())).map(r => (
                            <button key={r.id} onClick={() => { setSelRtId(r.id); setRtPickerOpen(false); setRtSearch(''); setRtPrice(String(r.price)); }}
                              className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${r.id === selRtId ? 'bg-apple-blue/20 text-white' : 'hover:bg-white/5'}`}>
                              <span>{r.type === 'round-bar' ? `${r.name} · Φ${r.diameter}mm` : `${r.name} · Φ${r.diameter}×${r.wallThickness}mm`}</span>
                              <span className="rounded-md px-2 py-0.5 text-xs bg-apple-blue/10 text-apple-text-secondary">{r.type === 'round-bar' ? t('calc.round_bar') : t('calc.round_tube')}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <label className="text-sm block">{t('calc.material_price')}
                    <input type="number" min="0" step="0.01" className={inputCls} value={rtPrice} onChange={e => setRtPrice(e.target.value)} />
                    <span className="block text-[11px] text-apple-text-secondary mt-1">{t('calc.material_price_tip')}</span>
                  </label>
                </div>
                <div className="space-y-4">
                  <label className="text-sm block">{t('calc.req_length')} <span className="text-xs text-apple-text-secondary">(mm/cm/m/in)</span>
                    <input type="text" inputMode="decimal" placeholder={t('calc.req_length_placeholder')} className={inputCls} value={rtReqLen} onChange={e => setRtReqLen(e.target.value)} />
                  </label>
                  <label className="text-sm block">{t('calc.cut_loss')}<span className="text-xs text-apple-text-secondary ml-1">{t('calc.saw_gap')}</span>
                    <input type="number" min="0" step="0.1" className={inputCls} value={rtLoss} onChange={e => setRtLoss(e.target.value)} />
                  </label>
                  <button onClick={doRtCalc} className={btnPrimary + ' mt-3'}><Calculator className="w-4 h-4 inline mr-2" />{t('calc.start_rod_calc')}</button>
                  {rtError && <p className="text-sm text-red-400">{rtError}</p>}
                </div>
              </div>
              {rtResult && (
                <div className="mt-6">
                  <div className="border-l-[3px] border-apple-blue bg-apple-blue/5 rounded-xl p-4 mb-4">
                    <p className="font-medium">{t(rtResult.typeLabel === 'round-bar' ? 'calc.round_bar' : 'calc.round_tube')}：{rtResult.name} · {t('calc.segments_per_rod_prefix')} {rtResult.pieces} {t('calc.segments')}</p>
                    <p className="text-sm text-apple-text-secondary mt-1">{t('calc.formula_label')}{rtResult.formula} = ¥{rtResult.costPer.toFixed(3)} {t('calc.per_segment')}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={statCard}><p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">{t('calc.segments_per_rod')}</p><p className="text-2xl font-bold text-apple-blue">{rtResult.pieces} {t('calc.segments')}</p></div>
                    <div className={statCard}><p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">{t('calc.cost_per_segment')}</p><p className="text-2xl font-bold text-green-400">¥{rtResult.costPer.toFixed(3)}</p></div>
                    <div className={statCard}><p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">{t('calc.material_utilization')}</p><p className="text-2xl font-bold text-purple-400">{rtResult.utilization.toFixed(2)}%</p></div>
                  </div>
                </div>
              )}
              {!rtResult && !rtError && <div className="py-12 text-center text-apple-text-secondary mt-6"><Info className="w-10 h-10 mx-auto mb-4 text-apple-secondary" />{t('calc.rod_calc_hint')}</div>}
            </div>
          </div>
        )}

        {/* ============ ROD/TUBE LIBRARY TAB ============ */}
        {tab === 'rodTubeLibrary' && (
          <div className="max-w-4xl mx-auto">
            <div className={glassCard}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold"><Archive className="w-5 h-5 text-apple-blue" />{t('calc.rod_library_title')}</h2>
                  <p className="text-sm text-apple-text-secondary mt-1">{t('calc.rod_format')}</p>
                </div>
                <button onClick={() => openRtEditor()} className="bg-apple-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:brightness-110 transition"><Plus className="w-3.5 h-3.5 inline mr-1" />{t('calc.new_material')}</button>
              </div>
              <input type="search" placeholder={t('calc.search_rod_library_placeholder')} className={inputCls + ' mb-4'} value={rtLibSearch} onChange={e => setRtLibSearch(e.target.value)} />
              {rtMaterials.filter(r => r.name.toLowerCase().includes(rtLibSearch.toLowerCase())).length === 0 ? (
                <p className="py-10 text-center text-sm text-apple-text-secondary">{rtMaterials.length ? t('calc.no_material_match') : t('calc.rod_lib_empty')}</p>
              ) : (
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {rtMaterials.filter(r => r.name.toLowerCase().includes(rtLibSearch.toLowerCase())).map(r => (
                    <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-apple-border/20 bg-apple-secondary/20 p-4">
                      <p className="text-sm">
                        {r.type === 'round-bar' ? `${t('calc.round_bar')} · ${r.name} · ${t('calc.diameter')} ${r.diameter} mm · ${t('calc.length_short')} ${r.length} cm` : `${t('calc.round_tube')} · ${r.name} · ${t('calc.diameter')} ${r.diameter} mm · ${t('calc.wall_thickness')} ${r.wallThickness} mm · ${t('calc.length_short')} ${r.length} cm`} · ¥{r.price.toFixed(2)}
                        <span className={`rounded-md px-2 py-0.5 text-xs ml-1 ${r.type === 'round-bar' ? 'bg-blue-900/40 text-blue-300' : 'bg-green-900/40 text-green-300'}`}>{r.type === 'round-bar' ? t('calc.round_bar') : t('calc.round_tube')}</span>
                      </p>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => openRtEditor(r)} className={ghostBtn}><Pencil className="w-3 h-3 inline mr-1" />{t('btn.edit')}</button>
                        <button onClick={() => { if (rtMaterials.length > 1) deleteRt(r.id); }} className={dangerBtn}><Trash2 className="w-3 h-3 inline mr-1" />{t('btn.delete')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center text-xs text-apple-text-secondary/60">{t('calc.footer')}</footer>
        <div className="mt-5 flex justify-end">
          <div className="glass-card px-4 py-3 text-sm inline-block">
            <button onClick={() => { showToast(t('calc.author_secret_toast')); setModal('authorSecret'); }} className="font-semibold hover:text-apple-blue transition">严弘</button>
            <a href="tel:19570155201" className="block text-apple-text-secondary hover:text-apple-blue transition mt-1">19570155201</a>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-apple-card border border-apple-border/30 rounded-[20px] px-5 py-3.5 text-sm shadow-2xl">{toast}</div>}

      {/* Author secret modal */}
      {modal === 'authorSecret' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-apple-card/95 border border-apple-border/30 rounded-[22px] p-6 shadow-2xl backdrop-blur-xl">
            <button onClick={() => setModal('none')} className="absolute right-3 top-3 rounded-full p-2 text-apple-text-secondary hover:bg-white/5 hover:text-white transition"><span className="text-lg">×</span></button>
            <h2 className="pr-8 text-lg font-semibold flex items-center gap-2"><Lock className="w-4 h-4 text-purple-400" />{t('calc.author_secret_title')}</h2>
            <p className="mt-2 text-sm text-apple-text-secondary">{t('calc.author_secret_desc')}</p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={() => { setEasterEggPreview(t('calc.april_fool_preview')); showToast(t('calc.april_fool_preview')); }} className="rounded-2xl px-4 py-3 text-sm border border-apple-border/20 bg-apple-secondary/20 hover:border-apple-blue/30 hover:bg-apple-blue/5 transition">{t('calc.view_april_fool')}</button>
              <button onClick={() => { setModal('birthday'); }} className="rounded-2xl px-4 py-3 text-sm border border-apple-border/20 bg-apple-secondary/20 hover:border-apple-blue/30 hover:bg-apple-blue/5 transition">{t('calc.view_birthday')}</button>
            </div>
            {easterEggPreview && <p className="mt-4 rounded-xl px-3 py-2.5 text-sm border border-apple-blue/15 bg-apple-blue/5">{easterEggPreview}</p>}
          </div>
        </div>
      )}

      {/* Birthday modal */}
      {modal === 'birthday' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-apple-card border border-apple-border/20 rounded-[22px] p-6 text-center shadow-xl">
            <button onClick={() => setModal('none')} className="absolute right-3 top-3 rounded-lg p-2 text-apple-text-secondary hover:bg-apple-secondary hover:text-white transition"><span className="text-lg">×</span></button>
            <Cake className="w-12 h-12 text-purple-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold bg-gradient-to-r from-apple-blue to-purple-400 bg-clip-text text-transparent">{t('calc.birthday_preview_title')}</h2>
            <p className="mt-3 text-sm text-apple-text-secondary leading-relaxed">{t('calc.birthday_preview_text')}</p>
            <button onClick={() => setModal('none')} className="mt-5 bg-gradient-to-r from-purple-400 to-apple-blue text-white rounded-apple py-3 px-6 text-sm font-semibold w-full">{t('calc.got_it')}</button>
          </div>
        </div>
      )}

      {/* Material Editor Modal */}
      {modal === 'materialEditor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={e => { e.preventDefault(); saveMat(); }} className="relative w-full max-w-md bg-apple-card/95 border border-apple-border/30 rounded-[22px] p-6 shadow-2xl backdrop-blur-xl">
            <button type="button" onClick={() => setModal('none')} className="absolute right-3 top-3 rounded-full p-2 text-apple-text-secondary hover:bg-white/5 hover:text-white transition"><span className="text-lg">×</span></button>
            <h2 className="pr-8 text-lg font-semibold">{editMatId ? t('calc.edit_board') : t('calc.new_board')}</h2>
            <div className="mt-5 space-y-4">
              <label className="text-sm block">{t('calc.board_name')}<input required maxLength={40} className={inputCls} value={matForm.name} onChange={e => setMatForm({ ...matForm, name: e.target.value })} placeholder={t('calc.name_placeholder_board')} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm block">{t('calc.length_cm')}<input required type="number" min="0.1" step="0.1" className={inputCls} value={matForm.length} onChange={e => setMatForm({ ...matForm, length: e.target.value })} /></label>
                <label className="text-sm block">{t('calc.width_cm')}<input required type="number" min="0.1" step="0.1" className={inputCls} value={matForm.width} onChange={e => setMatForm({ ...matForm, width: e.target.value })} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm block">{t('calc.thickness_mm')}<input required type="number" min="0.1" step="0.1" className={inputCls} value={matForm.thickness} onChange={e => setMatForm({ ...matForm, thickness: e.target.value })} /></label>
                <label className="text-sm block">{t('calc.color')}<input required type="text" className={inputCls} value={matForm.color} onChange={e => setMatForm({ ...matForm, color: e.target.value })} placeholder={t('calc.color_placeholder')} /></label>
              </div>
              <label className="text-sm block">{t('calc.default_price')}<input required type="number" min="0" step="0.01" className={inputCls} value={matForm.price} onChange={e => setMatForm({ ...matForm, price: e.target.value })} /></label>
            </div>
            <button type="submit" className={btnPrimary + ' mt-5'}>{t('calc.save_board')}</button>
          </form>
        </div>
      )}

      {/* RodTube Editor Modal */}
      {modal === 'rodTubeEditor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={e => { e.preventDefault(); saveRt(); }} className="relative w-full max-w-md bg-apple-card/95 border border-apple-border/30 rounded-[22px] p-6 shadow-2xl backdrop-blur-xl">
            <button type="button" onClick={() => setModal('none')} className="absolute right-3 top-3 rounded-full p-2 text-apple-text-secondary hover:bg-white/5 hover:text-white transition"><span className="text-lg">×</span></button>
            <h2 className="pr-8 text-lg font-semibold">{editRtId ? t('calc.edit_material') : t('calc.new_material')}</h2>
            <div className="mt-5 space-y-4">
              <label className="text-sm block">{t('calc.type')}
                <select className={inputCls} value={rtForm.type} onChange={e => setRtForm({ ...rtForm, type: e.target.value as 'round-bar' | 'round-tube' })}>
                  <option value="round-bar">{t('calc.round_bar')}</option><option value="round-tube">{t('calc.round_tube')}</option>
                </select>
              </label>
              <label className="text-sm block">{t('calc.name')}<input required maxLength={40} className={inputCls} value={rtForm.name} onChange={e => setRtForm({ ...rtForm, name: e.target.value })} placeholder={t('calc.name_placeholder_rod')} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm block">{t('calc.diameter_mm')}<input required type="number" min="0.1" step="0.1" className={inputCls} value={rtForm.diameter} onChange={e => setRtForm({ ...rtForm, diameter: e.target.value })} /></label>
                <label className={`text-sm block ${rtForm.type === 'round-bar' ? 'opacity-40 pointer-events-none' : ''}`}>{t('calc.wall_thickness_mm')}<input type="number" min="0.1" step="0.1" className={inputCls} value={rtForm.wallThickness} onChange={e => setRtForm({ ...rtForm, wallThickness: e.target.value })} disabled={rtForm.type === 'round-bar'} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm block">{t('calc.length_cm')}<input required type="number" min="0.1" step="0.1" className={inputCls} value={rtForm.length} onChange={e => setRtForm({ ...rtForm, length: e.target.value })} /></label>
                <label className="text-sm block">{t('calc.default_price')}<input required type="number" min="0" step="0.01" className={inputCls} value={rtForm.price} onChange={e => setRtForm({ ...rtForm, price: e.target.value })} /></label>
              </div>
            </div>
            <button type="submit" className={btnPrimary + ' mt-5'}>{t('calc.save_material')}</button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ==================== Product Costing Tab ==================== */

interface CostingBoardItem {
  id: string;
  materialId: string;
  prodLength: string;
  prodWidth: string;
  boardCount: string;
}

interface CostingItemRow {
  id: string;
  mat: Material;
  prodLength: number;
  prodWidth: number;
  boardCount: number;
  lengthCount: number;
  widthCount: number;
  perBoard: number;
  cutQty: number;
  cost: number;
  weight: number;
  valid: boolean;
  cuttable: boolean;
}

let costingUid = 0;
const nextCostingId = () => `cost-item-${Date.now()}-${costingUid++}`;
const costingFmt = (v: number, digits = 2): string => (Number.isFinite(v) ? v.toFixed(digits) : '—');
const costingNum = (s: string): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

function CostingTab({ materials, materialsLoaded }: { materials: Material[]; materialsLoaded: boolean }) {
  const inputCls = 'w-full bg-apple-secondary border border-apple-border rounded-apple px-3.5 py-2.5 text-sm text-apple-text placeholder-apple-text-secondary outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 transition';
  const glassCard = 'bg-apple-card/80 backdrop-blur-apple border border-apple-border/50 rounded-[20px] p-6';
  const statCard = 'bg-apple-secondary/60 border border-apple-border/30 rounded-[18px] p-5';
  const [items, setItems] = useState<CostingBoardItem[]>([]);
  const [productQty, setProductQty] = useState('1');
  const [loss, setLoss] = useState('0.5');
  const [density, setDensity] = useState('1.2');
  const [quoteCoef, setQuoteCoef] = useState('2');
  const [accessoryPrice, setAccessoryPrice] = useState('0');
  const [accessoryWeight, setAccessoryWeight] = useState('0');

  const options = materials.length > 0 ? materials : DEFAULT_MATERIALS;

  useEffect(() => {
    setItems(prev => {
      if (prev.length > 0) return prev;
      const list = materials.length > 0 ? materials : DEFAULT_MATERIALS;
      return [{ id: nextCostingId(), materialId: list[0].id, prodLength: '', prodWidth: '', boardCount: '1' }];
    });
  }, [materials, materialsLoaded]);

  const matById = (id: string): Material =>
    materials.find(m => m.id === id) || DEFAULT_MATERIALS.find(m => m.id === id) || materials[0] || DEFAULT_MATERIALS[0];

  const addItem = () => setItems(prev => [
    ...prev,
    { id: nextCostingId(), materialId: options[0].id, prodLength: '', prodWidth: '', boardCount: '1' },
  ]);

  const removeItem = (id: string) => setItems(prev => (prev.length <= 1 ? prev : prev.filter(i => i.id !== id)));

  const updateItem = (id: string, patch: Partial<CostingBoardItem>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const rows: CostingItemRow[] = useMemo(() => {
    const lossNum = costingNum(loss);
    const densityNum = costingNum(density);
    const lossOk = Number.isFinite(lossNum) && lossNum >= 0;

    return items.map(item => {
      const mat = matById(item.materialId);
      const l = parseDim(item.prodLength).value;
      const w = parseDim(item.prodWidth).value;
      const n = costingNum(item.boardCount);
      const valid = Number.isFinite(l) && Number.isFinite(w) && Number.isFinite(n) && l > 0 && w > 0 && n > 0;

      if (!valid) {
        return { id: item.id, mat, prodLength: l, prodWidth: w, boardCount: n, lengthCount: 0, widthCount: 0, perBoard: 0, cutQty: NaN, cost: 0, weight: 0, valid: false, cuttable: false };
      }

      const effLoss = lossOk ? lossNum : 0;
      // 方案 A：产品原始方向
      const lenA = Math.floor(mat.length / (l + effLoss));
      const widA = Math.floor(mat.width / (w + effLoss));
      const perA = lenA * widA;
      // 方案 B：产品旋转 90°
      const lenB = Math.floor(mat.length / (w + effLoss));
      const widB = Math.floor(mat.width / (l + effLoss));
      const perB = lenB * widB;
      const useB = perB > perA;
      const lengthCount = useB ? lenB : lenA;
      const widthCount = useB ? widB : widA;
      const perBoard = useB ? perB : perA;
      const cuttable = perBoard > 0;
      const cutQty = cuttable ? n / perBoard : NaN;
      const cost = cuttable ? mat.price / perBoard * n : 0;
      const weight = l * w * (Number.isFinite(densityNum) ? densityNum : 0) * mat.thickness / 1000 * n;

      return { id: item.id, mat, prodLength: l, prodWidth: w, boardCount: n, lengthCount, widthCount, perBoard, cutQty, cost, weight, valid: true, cuttable };
    });
  }, [items, materials, loss, density]);

  const summary = useMemo(() => {
    const qty = costingNum(productQty);
    const coef = costingNum(quoteCoef);
    const accPrice = costingNum(accessoryPrice);
    const accWeight = costingNum(accessoryWeight);
    const totalCutQty = rows.reduce((s, r) => s + (r.cuttable ? r.cutQty : 0), 0) * (Number.isFinite(qty) ? qty : 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    const quote = totalCost * (Number.isFinite(coef) ? coef : 0);
    const withAccessory = quote + (Number.isFinite(accPrice) ? accPrice : 0);
    const totalWeight = rows.reduce((s, r) => s + r.weight, 0) + (Number.isFinite(accWeight) ? accWeight : 0);
    return { totalCutQty, totalCost, quote, withAccessory, totalWeight };
  }, [rows, productQty, quoteCoef, accessoryPrice, accessoryWeight]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        <section className={glassCard}>
          <h2 className="flex items-center gap-2 text-base font-semibold mb-5"><Sliders className="w-4 h-4 text-apple-blue" />参数设置</h2>
          <div className="space-y-4">
            <label className="text-sm block">产品数量
              <input type="number" min="0" step="1" className={inputCls} value={productQty} onChange={e => setProductQty(e.target.value)} />
            </label>
            <label className="text-sm block">切割损耗（cm）
              <input type="number" min="0" step="0.1" className={inputCls} value={loss} onChange={e => setLoss(e.target.value)} />
            </label>
            <label className="text-sm block">密度系数
              <input type="number" min="0" step="0.1" className={inputCls} value={density} onChange={e => setDensity(e.target.value)} />
            </label>
            <label className="text-sm block">报价系数
              <input type="number" min="0" step="0.1" className={inputCls} value={quoteCoef} onChange={e => setQuoteCoef(e.target.value)} />
            </label>
            <label className="text-sm block">配件价（元）
              <input type="number" min="0" step="0.01" className={inputCls} value={accessoryPrice} onChange={e => setAccessoryPrice(e.target.value)} />
            </label>
            <label className="text-sm block">配件重量（kg）
              <input type="number" min="0" step="0.01" className={inputCls} value={accessoryWeight} onChange={e => setAccessoryWeight(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="space-y-6 lg:col-span-5">
          {items.map((item, idx) => {
            const row = rows[idx];
            const mat = row?.mat;
            return (
              <div key={item.id} className={glassCard}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-apple-text-secondary">板材条目 {idx + 1}</h2>
                  <button onClick={() => removeItem(item.id)} className="text-apple-text-secondary hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition" title="删除该条目"><Trash2 className="w-4 h-4" /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <label className="text-sm block">选择板材
                    <select className={inputCls} value={item.materialId} onChange={e => updateItem(item.id, { materialId: e.target.value })}>
                      {options.map(m => <option key={m.id} value={m.id}>{`${m.name} · ${m.length} × ${m.width} cm · 厚 ${m.thickness} mm · ${m.color}`}</option>)}
                    </select>
                  </label>
                  <label className="text-sm block">产品长（mm/cm/m/in）
                    <input type="text" inputMode="decimal" className={inputCls} value={item.prodLength} onChange={e => updateItem(item.id, { prodLength: e.target.value })} placeholder="例：30cm / 300mm" />
                  </label>
                  <label className="text-sm block">产品宽（mm/cm/m/in）
                    <input type="text" inputMode="decimal" className={inputCls} value={item.prodWidth} onChange={e => updateItem(item.id, { prodWidth: e.target.value })} placeholder="例：20cm / 200mm" />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <label className="text-sm block">板数
                    <input type="number" min="0" step="1" className={inputCls} value={item.boardCount} onChange={e => updateItem(item.id, { boardCount: e.target.value })} />
                  </label>
                  {mat && (
                    <div className="md:col-span-2 rounded-[14px] bg-apple-secondary/50 border border-apple-border/20 px-4 py-3 text-xs text-apple-text-secondary flex items-center gap-4 flex-wrap">
                      <span className="text-apple-text font-medium">{mat.name}</span>
                      <span>{mat.length} × {mat.width} cm</span>
                      <span>厚 {mat.thickness} mm</span>
                      <span className="text-apple-blue">{mat.color}</span>
                      <span className="text-green-400">¥{mat.price}</span>
                    </div>
                  )}
                </div>

                {row && row.valid && (
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="rounded-[14px] bg-apple-secondary/40 border border-apple-border/20 p-3">
                      <p className="text-[10px] text-apple-text-secondary uppercase tracking-wider mb-1">长向件数</p>
                      <p className="text-base font-bold text-apple-blue">{row.lengthCount}</p>
                    </div>
                    <div className="rounded-[14px] bg-apple-secondary/40 border border-apple-border/20 p-3">
                      <p className="text-[10px] text-apple-text-secondary uppercase tracking-wider mb-1">宽向件数</p>
                      <p className="text-base font-bold text-apple-blue">{row.widthCount}</p>
                    </div>
                    <div className="rounded-[14px] bg-apple-secondary/40 border border-apple-border/20 p-3">
                      <p className="text-[10px] text-apple-text-secondary uppercase tracking-wider mb-1">每板可开数</p>
                      <p className="text-base font-bold text-white">{row.perBoard}</p>
                    </div>
                    <div className="rounded-[14px] bg-apple-secondary/40 border border-apple-border/20 p-3">
                      <p className="text-[10px] text-apple-text-secondary uppercase tracking-wider mb-1">开料数量</p>
                      <p className="text-base font-bold text-white">{costingFmt(row.cutQty, 3)}</p>
                    </div>
                    <div className="rounded-[14px] bg-apple-secondary/40 border border-apple-border/20 p-3">
                      <p className="text-[10px] text-apple-text-secondary uppercase tracking-wider mb-1">材料成本（元）</p>
                      <p className="text-base font-bold text-green-400">{costingFmt(row.cost)}</p>
                    </div>
                    <div className="rounded-[14px] bg-apple-secondary/40 border border-apple-border/20 p-3">
                      <p className="text-[10px] text-apple-text-secondary uppercase tracking-wider mb-1">单板重量（kg）</p>
                      <p className="text-base font-bold text-purple-400">{costingFmt(row.weight, 3)}</p>
                    </div>
                  </div>
                )}

                {row && row.valid && !row.cuttable && (
                  <p className="mt-3 text-xs text-orange-400">该板材尺寸无法开出任何产品，请检查产品尺寸或损耗。</p>
                )}
              </div>
            );
          })}

          <button onClick={addItem} className="flex items-center justify-center gap-2 w-full border border-dashed border-apple-border/40 hover:border-apple-blue/50 text-apple-text-secondary hover:text-apple-blue rounded-[16px] py-3 text-sm transition"><Plus className="w-4 h-4" />添加板材条目</button>

          <div className={glassCard}>
            <h2 className="flex items-center gap-2 text-base font-semibold mb-5"><BarChart3 className="w-4 h-4 text-apple-blue" />汇总</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className={statCard}>
                <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">总开料数量</p>
                <p className="text-2xl font-bold text-apple-blue">{costingFmt(summary.totalCutQty, 3)}</p>
              </div>
              <div className={statCard}>
                <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">总材料成本</p>
                <p className="text-2xl font-bold text-white">¥{costingFmt(summary.totalCost)}</p>
              </div>
              <div className={statCard}>
                <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">产品报价</p>
                <p className="text-2xl font-bold text-green-400">¥{costingFmt(summary.quote)}</p>
              </div>
              <div className={statCard}>
                <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">含配件价</p>
                <p className="text-2xl font-bold text-orange-400">¥{costingFmt(summary.withAccessory)}</p>
              </div>
              <div className={statCard}>
                <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">总重量（kg）</p>
                <p className="text-2xl font-bold text-purple-400">{costingFmt(summary.totalWeight, 3)}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ==================== Packing Size Tab ==================== */

const packingFmt = (v: number, digits = 2): string => (Number.isFinite(v) ? v.toFixed(digits) : '—');
const packingNum = (s: string): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

function PackingTab() {
  const inputCls = 'w-full bg-apple-secondary border border-apple-border rounded-apple px-3.5 py-2.5 text-sm text-apple-text placeholder-apple-text-secondary outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 transition';
  const glassCard = 'bg-apple-card/80 backdrop-blur-apple border border-apple-border/50 rounded-[20px] p-6';
  const statCard = 'bg-apple-secondary/60 border border-apple-border/30 rounded-[18px] p-5';

  const [prodLength, setProdLength] = useState('');
  const [prodWidth, setProdWidth] = useState('');
  const [prodHeight, setProdHeight] = useState('');
  const [unitWeight, setUnitWeight] = useState('');
  const [boxLength, setBoxLength] = useState('');
  const [boxWidth, setBoxWidth] = useState('');
  const [boxHeight, setBoxHeight] = useState('');
  const [cartonThickness, setCartonThickness] = useState('2');
  const [outerAllowance, setOuterAllowance] = useState('2');
  const [cartonWeight, setCartonWeight] = useState('1.5');

  const result = useMemo(() => {
    const l = packingNum(prodLength);
    const w = packingNum(prodWidth);
    const h = packingNum(prodHeight);
    const uw = packingNum(unitWeight);
    const bl = packingNum(boxLength);
    const bw = packingNum(boxWidth);
    const bh = packingNum(boxHeight);
    const ct = packingNum(cartonThickness);
    const oa = packingNum(outerAllowance);
    const cw = packingNum(cartonWeight);
    const valid = [l, w, h, uw, bl, bw, bh, ct, oa, cw].every(v => Number.isFinite(v) && v >= 0)
      && l > 0 && w > 0 && h > 0 && uw > 0 && bl > 0 && bw > 0 && bh > 0;

    if (!valid) {
      return { valid: false, innerL: NaN, innerW: NaN, innerH: NaN, outerL: NaN, outerW: NaN, outerH: NaN, qty: NaN, weight: NaN };
    }
    const innerL = l + ct;
    const innerW = w + ct;
    const innerH = h + ct;
    const outerL = bl * innerL + oa;
    const outerW = bw * innerW + oa;
    const outerH = bh * innerH + oa;
    const qty = bl * bw * bh;
    const weight = qty * uw / 1000 + cw;
    return { valid: true, innerL, innerW, innerH, outerL, outerW, outerH, qty, weight };
  }, [prodLength, prodWidth, prodHeight, unitWeight, boxLength, boxWidth, boxHeight, cartonThickness, outerAllowance, cartonWeight]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <section className={glassCard}>
        <h2 className="flex items-center gap-2 text-base font-semibold mb-5"><Sliders className="w-4 h-4 text-apple-blue" />参数设置</h2>
        <div className="flex flex-wrap gap-4">
          <div className="w-44">
            <label className="text-sm block mb-1">产品长（cm）</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={prodLength} onChange={e => setProdLength(e.target.value)} placeholder="例：30" />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">产品宽（cm）</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={prodWidth} onChange={e => setProdWidth(e.target.value)} placeholder="例：20" />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">产品高（cm）</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={prodHeight} onChange={e => setProdHeight(e.target.value)} placeholder="例：10" />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">单品重量（g）</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={unitWeight} onChange={e => setUnitWeight(e.target.value)} placeholder="例：500" />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">长向装箱数</label>
            <input type="number" min="0" step="1" className={inputCls} value={boxLength} onChange={e => setBoxLength(e.target.value)} />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">宽向装箱数</label>
            <input type="number" min="0" step="1" className={inputCls} value={boxWidth} onChange={e => setBoxWidth(e.target.value)} />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">高向装箱数</label>
            <input type="number" min="0" step="1" className={inputCls} value={boxHeight} onChange={e => setBoxHeight(e.target.value)} />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">飞机盒厚度（cm）</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={cartonThickness} onChange={e => setCartonThickness(e.target.value)} />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">外箱余量（cm）</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={outerAllowance} onChange={e => setOuterAllowance(e.target.value)} />
          </div>
          <div className="w-44">
            <label className="text-sm block mb-1">箱体自重（kg）</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={cartonWeight} onChange={e => setCartonWeight(e.target.value)} />
          </div>
        </div>
      </section>

      <section className={glassCard}>
        <h2 className="flex items-center gap-2 text-base font-semibold mb-5"><BarChart3 className="w-4 h-4 text-apple-blue" />计算结果</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={statCard}>
            <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">内盒长（cm）</p>
            <p className="text-2xl font-bold text-apple-blue">{packingFmt(result.innerL)}</p>
          </div>
          <div className={statCard}>
            <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">内盒宽（cm）</p>
            <p className="text-2xl font-bold text-apple-blue">{packingFmt(result.innerW)}</p>
          </div>
          <div className={statCard}>
            <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">内盒高（cm）</p>
            <p className="text-2xl font-bold text-apple-blue">{packingFmt(result.innerH)}</p>
          </div>
          <div className={statCard}>
            <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">外箱长（cm）</p>
            <p className="text-2xl font-bold text-white">{packingFmt(result.outerL)}</p>
          </div>
          <div className={statCard}>
            <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">外箱宽（cm）</p>
            <p className="text-2xl font-bold text-white">{packingFmt(result.outerW)}</p>
          </div>
          <div className={statCard}>
            <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">外箱高（cm）</p>
            <p className="text-2xl font-bold text-white">{packingFmt(result.outerH)}</p>
          </div>
          <div className={statCard}>
            <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">装箱数量（pcs）</p>
            <p className="text-2xl font-bold text-green-400">{packingFmt(result.qty, 0)}</p>
          </div>
          <div className={statCard}>
            <p className="text-[11px] text-apple-text-secondary font-semibold uppercase tracking-wider mb-1">箱体重量（kg）</p>
            <p className="text-2xl font-bold text-purple-400">{packingFmt(result.weight, 3)}</p>
          </div>
        </div>
        {!result.valid && (
          <p className="mt-4 text-xs text-apple-text-secondary">请完整填写产品长/宽/高、单品重量及每向装箱数，以查看计算结果。</p>
        )}
      </section>
    </div>
  );
}
