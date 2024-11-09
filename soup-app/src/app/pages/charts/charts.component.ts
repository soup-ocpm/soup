import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [],
  templateUrl: './charts.component.html',
  styleUrl: './charts.component.scss'
})
export class ChartsComponent implements OnInit {
  // Pie chart
  @ViewChild('pieChart', { static: true }) pieChartElement: ElementRef | undefined;

  // Bar chart
  @ViewChild('barChart', { static: true }) barChartElement: ElementRef | undefined;

  // Line chart
  @ViewChild('lineChart', { static: true }) lineChartElement: ElementRef | undefined;

  constructor() {
    // Registriamo i moduli di Chart.js
    Chart.register(...registerables);
  }

  public ngOnInit(): void {
    this.createPieChart();
    this.createBarChart();
    this.createLineChart();
  }

  // ------PIE CHART------
  public createPieChart(): void {
    const ctx = (this.pieChartElement?.nativeElement as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      new Chart(ctx, {
        type: 'pie', // Tipo di grafico
        data: {
          labels: ['Normal Execution', 'Class Execution', 'Event Execution', 'Entity Execution', 'Corr Execution'], // Etichette
          datasets: [
            {
              label: 'Durata in secondi', // Etichetta del dataset
              data: [120, 130, 110, 115, 150], // Dati (durate in secondi)
              backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'], // Colori per ogni fetta
              borderColor: '#fff', // Colore del bordo delle fette
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top' // Posizione della legenda
            },
            title: {
              display: true, // Mostra il titolo
              text: 'Pie Chart' // Testo del titolo
            }
          }
        }
      });
    }
  }

  //------BAR CHART------

  public createBarChart(): void {
    const ctx = (this.barChartElement?.nativeElement as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      let delayed = false;

      const DATA_COUNT = 7; // Numero di barre (esempio: 7 mesi)
      const NUMBER_CFG = { count: DATA_COUNT, min: -100, max: 100 };

      // Usa la funzione `getMonths` per ottenere le etichette (mesi)
      const labels = this.getMonths(DATA_COUNT);

      // Usa la funzione `generateRandomData` per generare i dati per ogni dataset
      const data = {
        labels: labels,
        datasets: [
          {
            label: 'Dataset 1',
            data: this.generateRandomData(NUMBER_CFG.count, NUMBER_CFG.min, NUMBER_CFG.max),
            backgroundColor: '#FF6384' // Colore personalizzato per il dataset 1
          },
          {
            label: 'Dataset 2',
            data: this.generateRandomData(NUMBER_CFG.count, NUMBER_CFG.min, NUMBER_CFG.max),
            backgroundColor: '#36A2EB' // Colore personalizzato per il dataset 2
          },
          {
            label: 'Dataset 3',
            data: this.generateRandomData(NUMBER_CFG.count, NUMBER_CFG.min, NUMBER_CFG.max),
            backgroundColor: '#FFCE56' // Colore personalizzato per il dataset 3
          }
        ]
      };

      // Crea il grafico
      new Chart(ctx, {
        type: 'bar', // Tipo di grafico
        data: data, // Dati da visualizzare
        options: {
          animation: {
            onComplete: () => {
              delayed = true;
            },
            delay: (context) => {
              let delay = 0;
              if (context.type === 'data' && context.mode === 'default' && !delayed) {
                delay = context.dataIndex * 300 + context.datasetIndex * 100;
              }
              return delay;
            }
          },
          scales: {
            x: {
              stacked: true // Barre impilate sull'asse X
            },
            y: {
              stacked: true // Barre impilate sull'asse Y
            }
          },
          plugins: {
            legend: {
              position: 'top' // Posizione della legenda
            },
            title: {
              display: true,
              text: 'Bar Chart' // Titolo del grafico
            }
          }
        }
      });
    }
  }

  // Funzione per generare numeri casuali in un range specificato
  public generateRandomData(count: number, min: number, max: number): number[] {
    return Array.from({ length: count }, () => Math.floor(Math.random() * (max - min + 1)) + min);
  }

  // Funzione per ottenere un array di mesi (o qualsiasi altro array di etichette)
  public getMonths(count: number): string[] {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.slice(0, count); // Restituisce i primi 'count' mesi
  }

  // ------LINE CHART------

  public createLineChart(): void {
    const ctx = (this.lineChartElement?.nativeElement as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      // Dati fittizi per la demo (puoi sostituire con dati reali)
      const data = this.generateLineRandomData(50, 0, 100); // Dati per la prima linea
      const data2 = this.generateLineRandomData(50, 0, 100); // Dati per la seconda linea

      const totalDuration = 10000; // Durata totale per l'animazione (in millisecondi)

      // Configurazione del grafico
      new Chart(ctx, {
        type: 'line', // Tipo di grafico
        data: {
          datasets: [
            {
              borderColor: '#FF6384', // Colore per la prima linea
              borderWidth: 1,
              data: data, // Dati per la prima linea
              fill: false // Non riempire sotto la linea
            },
            {
              borderColor: '#36A2EB', // Colore per la seconda linea
              borderWidth: 1,
              data: data2, // Dati per la seconda linea
              fill: false // Non riempire sotto la linea
            }
          ]
        },
        options: {
          animation: {
            duration: totalDuration,
            easing: 'linear', // Puoi scegliere un altro easing se preferisci
            onComplete: () => {}
          },
          interaction: {
            intersect: false // Le linee intersecano le ascisse
          },
          plugins: {
            legend: {
              display: false // Nascondi la legenda
            }
          },
          scales: {
            x: {
              type: 'linear' // Scala lineare per l'asse X
            }
          }
        }
      });
    }
  }

  // Funzione per generare numeri casuali per i dati (fino a 1000 punti, per esempio)
  public generateLineRandomData(count: number, min: number, max: number): any[] {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({ x: i, y: Math.floor(Math.random() * (max - min + 1)) + min });
    }
    return data;
  }
}
