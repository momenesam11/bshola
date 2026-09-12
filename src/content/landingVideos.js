/**
 * The three explainer videos on the landing page.
 *
 * Hosted as unlisted YouTube uploads rather than files in `public/videos/`
 * (see the README there): a few uploaded promo videos add tens of MB each,
 * which would bloat every clone/deploy of this repo for a page that only
 * ever needs to serve them as a click-to-play embed, something YouTube
 * already does — compressed, adaptive-bitrate, CDN-served — for free.
 *
 * One source for both the rendered <VideoSection /> and the VideoObject
 * structured data, so a video can never be described to Google differently
 * from how it is shown — or described at all while it is still missing.
 *
 * To publish a video, set `youtubeId` to the id from its youtu.be/<id> link
 * (upload it as Unlisted, never Public — see the README). Optionally add
 * `uploadDate` (ISO) + `duration` (ISO 8601, e.g. 'PT1M45S') to improve the
 * structured data. A locally-hosted `src` file still works as an alternative
 * (VideoSection supports both) for anyone who'd rather self-host.
 *
 * Until a video is set the section renders a labelled placeholder naming
 * what it's waiting for, and no VideoObject is emitted. The written steps
 * are the text alternative and carry the section on their own either way.
 */

export const LANDING_VIDEOS = {
  booking: {
    id: 'how-patients-book',
    title: 'المريض بيحجز في 3 خطوات',
    lead:
      'ده اللي عميلك بيشوفه لما يفتح رابط حجزك. مفيش تحميل تطبيق، مفيش تسجيل حساب، ومفيش استنية لحد يرد عليه.',
    youtubeId: 'GKR4YlVFs2Q',
    stepsTitle: 'الخطوات زي ما هي في صفحة الحجز',
    steps: [
      {
        title: 'يختار الخدمة',
        desc: 'الخدمات اللي انت كاتبها بمدتها وسعرها. المدة هي اللي النظام بيحسب بيها المواعيد المتاحة.',
      },
      {
        title: 'يختار الموعد',
        desc: 'بيشوف الأوقات الفاضية فعلاً حسب ساعات عملك. لو كله محجوز، يسجّل في قائمة الانتظار وتبلّغه أول ما يتفرج موعد.',
      },
      {
        title: 'يكتب بياناته ويأكد',
        desc: 'اسمه ورقم واتساب وخلاص. يوصله تأكيد، ويوصلك انت إشعار فوري بصوت في النظام.',
      },
    ],
  },

  signup: {
    id: 'how-to-signup',
    title: 'حسابك جاهز في أقل من 5 دقايق',
    lead:
      'النظام بيمشّيك على 6 خطوات، كل واحدة فيها اختيارات جاهزة. في آخر خطوة يبقى معاك رابط حجز شغال تبعته لعملاءك.',
    youtubeId: 'MvhU_10dhyQ',
    stepsTitle: 'الـ6 خطوات',
    steps: [
      {
        title: 'نوع النشاط',
        desc: 'عيادة، صالون، جيم، تعليم، ملاعب، أو خدمات تانية — النظام بيقترح خدمات جاهزة لنشاطك ويظهر الملف الطبي للعيادات بس.',
      },
      {
        title: 'معلوماتك',
        desc: 'اسم النشاط، رقم الواتساب بتاعك، والرقم اللي يظهر لعملاءك.',
      },
      {
        title: 'الفروع',
        desc: 'فرع واحد أو أكتر. كل فرع بعنوانه وساعات عمله، ولغير العيادات كام حجز متوازي يستحمل.',
      },
      {
        title: 'ساعات العمل',
        desc: 'مدة الموعد الواحد (من 15 دقيقة لساعة ونصف) وأيام وساعات الشغل — وتقدر تحدد أكتر من فترة في اليوم.',
      },
      {
        title: 'الخدمات',
        desc: 'تختار من الخدمات المقترحة أو تكتب بتاعتك، وتحدد مدة وسعر كل واحدة.',
      },
      {
        title: 'هويتك',
        desc: 'لوجو وصورة غلاف ولون أساسي ورابط حجز باسمك ورسالة ترحيب وسياسة إلغاء — كل ده بيظهر في صفحة الحجز.',
      },
    ],
    cta: { to: '/register', label: 'ابدأ حسابك دلوقتي', note: '14 يوم مجاناً · من غير بطاقة بنكية' },
  },

  tour: {
    id: 'system-tour',
    title: 'جولة سريعة في النظام',
    lead: 'اليوم الواحد في بسهولة: تشوف مواعيدك، تبعت تذكيرات بكرا، وتتابع عملاءك وفلوسك.',
    youtubeId: 'DBaWdV-xNfs',
    stepsTitle: 'اللي هتشوفه',
    steps: [
      {
        title: 'كاليندر اليوم',
        desc: 'عرض يوم أو أسبوع أو شهر، وكل موعد بحالته: مؤكد، مكتمل، لم يحضر، ملغي.',
      },
      {
        title: 'تذكيرات بكرا',
        desc: 'قائمة بكل اللي عندهم مواعيد بكرا، والنظام يمشّيك عليهم واحد واحد بضغطة زر لكل واحد.',
      },
      {
        title: 'ملف العميل',
        desc: 'كل زياراته ومدفوعاته وخطة زياراته، وللعيادات التشخيص والروشتات والمرفقات.',
      },
      {
        title: 'التقارير',
        desc: 'معدل الحضور، وقيمة الغياب بالجنيه مقابل اللي اتوفّر بالتذكير.',
      },
    ],
  },
}

export const LANDING_VIDEO_LIST = Object.values(LANDING_VIDEOS)
