'use client'

import styles from './page.module.css'
import { useRequestWebHIDDevice } from './webhid'
import { DP100_USB_INFO, useDP100, useInfoSubscription } from './dp100/dp100';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BasicInfo, BasicSet } from './dp100/frame-data';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);


const filters = [DP100_USB_INFO];

export default function Home() {
  const { requestAndOpen, device, errorMessage } = useRequestWebHIDDevice({requestOptions: {filters}})
  return (
    <main className={styles.main}>
      { device && (<DP100 device={device} />)}
      { device === null ? (requestAndOpen !== null ? <button onClick={requestAndOpen}>Connect</button> : <div>Something's not right. Is webhid supported in your browser?</div>) : null }
      { errorMessage && <div><b>{errorMessage}</b></div> }
    </main>
  )
}

interface IDP100Props {
  device: HIDDevice,
}

const chartOptions: ChartOptions = {
  responsive: true,
  plugins: {
    legend: {
      position: 'top' as const,
    },
    title: {
      display: true,
      text: 'Output',
    },
  },
  animation: { duration: 0 },
  scales: {
    y: {
      type: 'linear' as const,
      display: true,
      position: 'left' as const,

    },
    y1: {
      type: 'linear' as const,
      display: true,
      position: 'right' as const,
    }
  }
};

interface ChartData {
  maxDataPoints: number,
  timestamps: Date[],
  currents: number[],
  voltages: number[],
}

const chartValues: ChartData = {
  maxDataPoints: 1000,
  timestamps: [],
  currents: [],
  voltages: [],
}


const sleep = async (delayMs: number) =>  new Promise((resolve) => setTimeout(resolve, delayMs))
const DP100: React.FC<IDP100Props> = ({device}) => {
  const dp100 = useDP100(device)

  const {data: basicInfo, refresh: refreshBasicInfo } = useInfoSubscription(() => dp100.getBasicInfo(), 150)
  const {data: basicSet, refresh: refreshBasicSet } = useInfoSubscription(() => dp100.getCurrentBasic(), 2000)

  const setBasic = async (data: BasicSet) => {
    if (!await dp100.setBasic(data)) {
      console.warn('setBasic failed')
      return
    }
    await sleep(100)
    refreshBasicSet()
  }

  const updateBasic = async (updates: Partial<BasicSet>) => {
    if (basicSet === null) {
      throw new Error('Can\'t update before receiving state')
    }
    return setBasic({
      ...basicSet,
      ...updates,
    })
  }

  const modeStr = basicInfo === null ? 'unknown' : 
    basicInfo.out_mode === 2 ? 'OFF' : basicInfo.out_mode === 1 ? 'CV' : basicInfo.out_mode === 0 ? 'CC' : basicInfo.out_mode === 130 ? 'UVP' : 'unknown'

  // Collect chart data.
  if (basicInfo) {
    if (chartValues.currents.length > chartValues.maxDataPoints) {
      chartValues.timestamps.shift()
      chartValues.currents.shift();
      chartValues.voltages.shift();
    }
    chartValues.timestamps.push(new Date())
    chartValues.currents.push(basicInfo?.iout / 1000)
    chartValues.voltages.push(basicInfo?.vout / 1000)
  }

  const chartData = {
    labels: chartValues.timestamps.map((v, _) => `${v.getHours()}:${v.getMinutes()}:${v.getSeconds()}.${v.getMilliseconds()}`),
    datasets: [
      {
        label: 'Currents',
        data: chartValues.currents,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        yAxisID: 'y',
      },
      {
        label: 'Voltages',
        data: chartValues.voltages,
        borderColor: 'rgb(132, 99, 132)',
        backgroundColor: 'rgba(132, 99, 132, 0.5)',
        yAxisID: 'y1',
      },
    ],
  };

  return (
    <>
    <div>
      Connected to <b>{device.productName}</b>
    </div>
    <div>
      { basicSet && (
        <>
      </>
    )}
    </div>
    <br />
    <div>
      {basicSet && basicInfo && (
        <table border={1} cellPadding={5}>
          <thead>
            <tr>
              <th></th>
              <th style={{width: '140px'}}>Set</th>
              <th>Out</th></tr>
          </thead>
          <tbody>
          <tr>
            <td>Status</td>
            <td>
              <button onClick={() => updateBasic({
                state: 0,
              })}>OFF</button>
              <button onClick={() => updateBasic({
                state: 1,
              })}>ON</button>
            </td>
            <td>{modeStr}</td>
          </tr>
          <tr>
            <td>Voltage</td>
            <td><Editable value={(basicSet.vo_set / 1000).toFixed(2)} suffix='V' onSave={(v) => updateBasic({vo_set: Number.parseFloat(v) * 1000})} /></td>
            <td>{(basicInfo.vout / 1000).toFixed(2)}V</td>
          </tr>
          <tr>
            <td>Current</td>
            <td><Editable value={(basicSet.io_set / 1000).toFixed(3)} suffix='A' onSave={(v) => updateBasic({io_set: Number.parseFloat(v) * 1000})} /></td>
            <td>{(basicInfo.iout / 1000).toFixed(3)}A</td>
          </tr>
          <tr>
            <td>Data</td>
            <td><UpdateIndicator data={basicSet?._ts} /></td>
            <td><UpdateIndicator data={basicInfo?._ts} /></td>
          </tr>
          </tbody>
        </table>
      )}
      
    </div>
    <br />
    <div>
      {basicInfo && (
        <table border={1} cellPadding={5}>
          <tbody>
          <tr><td>V IN</td><td>{(basicInfo.vin / 1000).toFixed(2)}V</td></tr>
          <tr><td>v_out_max</td><td>{(basicInfo.vo_max / 1000).toFixed(2)}V</td></tr>
          </tbody>
        </table>
      )}
    </div>
    <br />
    <Line options={chartOptions} data={chartData} />;
    </>
  )
}

type EditableProps = {
  value: string,
  suffix: string,
  onSave: (v: string) => void,
}
const Editable: React.FC<EditableProps> = ({value, suffix, onSave}) => {
  const [editing, setEditing] = useState<boolean>(false)
  const [draftValue, setDraftValue] = useState<string>("")

  const save = () => {
    onSave(draftValue);
    setEditing(false);
  }
  const cancel = () => {
    setEditing(false);
  }

  return editing ? (<div>
    <input 
      type="number"
      value={draftValue}
      step="0.01"
      style={{width: '50px'}}
      onChange={(e) => setDraftValue(e.target.value)}
      autoFocus
      onFocus={(e) => e.target.select()} 
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          save()
        } else if (e.key === 'Escape') {
          cancel()
        }
      }}
    />
    { suffix }
    &nbsp;&nbsp;
    <button onClick={save}>✓</button>
    <button onClick={cancel}>✗</button>
    </div>) : (<div onClick={() => {
      setDraftValue(value);
      setEditing(true);
    }}>{value}{suffix}</div>)
}

type UpdateIndicatorProps = {
  data: any
}
const UpdateIndicator: React.FC<UpdateIndicatorProps> = ({data}) => {
  const [visible, setVisible] = useState<boolean>(false)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useMemo(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
    }
    setVisible(true);
    timeoutRef.current = setTimeout(() => setVisible(false), 50);
  }, [data])

  return visible ? <>🔵</> : <>⚪</>
}
