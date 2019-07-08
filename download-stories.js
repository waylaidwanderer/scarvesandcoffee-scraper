const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const sanitize = require('sanitize-filename');

const Epub = require('epub-gen');

main();

async function main() {
    const stories = JSON.parse(fs.readFileSync('./metadata.json', 'utf8'));
    for (let i = 0; i < stories.length; i++) {
        console.log(`Processing ${i + 1} of ${stories.length}...`);
        const story = stories[i];
        await downloadStory(story);
        console.log('\n=======================================================\n');
    }
}

async function downloadStory(metadata) {
    const fileName = sanitize(`${metadata.id} - ${metadata.title} - ${metadata.author}.epub`);
    if (fs.existsSync(`./downloads/${fileName}`)) {
        return;
    }
    const { id, rating } = metadata;
    console.log(`[#${metadata.id}: ${metadata.title} - ${metadata.author}] Fetching list of chapters...`);
    let url = `http://scarvesandcoffee.net/viewstory.php?sid=${id}`;
    if (rating === 'R') {
        url = `${url}&warning=21`;
    } else if (rating === 'M') {
        url = `${url}&warning=20`;
    }
    let response;
    try {
        response = await axios.get(url);
    } catch (err) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return downloadStory(metadata);
    }
    const $ = cheerio.load(response.data);
    const chapters = [];
    $('#output')
        .find(`a[href^="viewstory.php?sid=${id}&chapter="]`)
        .each(function() {
            let chapterUrl = `http://scarvesandcoffee.net/${$(this).attr('href')}`;
            if (rating === 'R') {
                chapterUrl = `${chapterUrl}&warning=21`;
            } else if (rating === 'M') {
                chapterUrl = `${chapterUrl}&warning=20`;
            }
            chapters.push({
                name: $(this).text().trim(),
                url: chapterUrl,
            });
        });
    const chapterPromises = [];
    for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        chapterPromises.push(downloadChapter(chapter.name, chapter.url, i * 100));
    }
    console.log(`Downloading ${chapters.length} chapters...`);
    const chaptersData = await Promise.all(chapterPromises);
    const titlePageHtml =
`<div style="text-align: center;">
    <h1>${metadata.title}</h1>
    <h2>by ${metadata.author}</h2>
    <h5>Rating: ${metadata.rating} | Reviews: ${metadata.reviews}</h5>
</div>
<div style="text-align: center">
    ${await cleanSummary(metadata.summary)}
    <hr/>
    <p>
        Story #${metadata.id} | Published: ${metadata.published_date} | Updated: ${metadata.updated_date}
    </p>
</div>`;
    const titlePage = {
        title: 'Title',
        data: titlePageHtml,
        beforeToc: true,
    };
    console.log('Generating epub...');
    await generateEpub(metadata, [
        titlePage,
        ...chaptersData,
    ]);
    console.log(`Downloaded story #${id}.`);
}

async function cleanSummary(summary) {
    const $ = cheerio.load(summary);
    $('*').removeAttr('style');
    $('style').remove();
    const imgsToCheck = [];
    $('img').each(function() {
        const src = $(this).attr('src');
        if (!src) {
            $(this).remove();
            return;
        }
        if (
            !src.startsWith('http')
        ) {
            $(this).remove();
        } else {
            imgsToCheck.push($(this));
        }
    });
    const checkPromises = [];
    const checkImg = async (img) => {
        try {
            await axios.get(img.attr('src'));
        } catch (err) {
            img.remove();
        }
    };
    imgsToCheck.forEach(img => checkPromises.push(checkImg(img)));
    await Promise.all(checkPromises);
    return $('body').html();
}

async function downloadChapter(name, url, waitMs) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
    console.log(`Downloading chapter "${name}" (${url})`);
    let response;
    try {
        response = await axios.get(url);
    } catch (err) {
        return downloadChapter(name, url, 2000);
    }
    const $ = cheerio.load(response.data);
    $('*').removeAttr('style');
    $('style').remove();
    $('img').remove();
    const storyContainer = $('#skinny');
    const notes = storyContainer.find('.notes').first().html();
    const storyHtml = $('#story').find('span').first().html();
    const endNotes = storyContainer.find('.notes').last().html();

    let chapterHtml = `<div style="text-align: center;"><h1>${name}</h1></div>`;
    if (notes) {
        chapterHtml = `${chapterHtml}<div>${notes}</div>`;
    }
    chapterHtml = `${chapterHtml}<div>${storyHtml}</div>`;
    if (endNotes) {
        chapterHtml = `${chapterHtml}<hr/><div>${endNotes}</div>`
    }

    return {
        title: name,
        data: chapterHtml,
    };
}

function generateEpub(metadata, chapters) {
    const option = {
        title: metadata.title,
        author: metadata.author,
        content: chapters,
        appendChapterTitles: false,
    };

    const fileName = sanitize(`${metadata.id} - ${metadata.title} - ${metadata.author}.epub`);
    return new Epub(option, `./downloads/${fileName}`).promise;
}
