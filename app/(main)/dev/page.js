// app/dev/page.js
import styles from "./dev.module.css";

export default function DevPage() {
  return (
    <div className={styles.container}>
      <iframe
        className={styles.iframe}
        src="https://docs.google.com/spreadsheets/d/1Hv5sRpvDsTHOfRIqf6b3akMpas9C2I6tshJQaxWkJMY/edit?gid=0#gid=0"
        title="Google Sheet Dev"
      ></iframe>
      <a
        href="https://viewer.diagrams.net/?tags=%7B%7D&lightbox=1&highlight=0000ff&edit=https%3A%2F%2Fapp.diagrams.net%2F%3Fsplash%3D0%23G1WAx8A0zRp0-5T5Fn9npv1M8nXClM41-D%23%257B%2522pageId%2522%253A%2522ZgStL5cAJhyZyoSGIkwh%2522%257D&layers=1&nav=1&title=note.drawio&dark=auto#Uhttps%3A%2F%2Fdrive.google.com%2Fuc%3Fid%3D1WAx8A0zRp0-5T5Fn9npv1M8nXClM41-D%26export%3Ddownload"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        Go to Draw.io
      </a>
    </div>
  );
}
